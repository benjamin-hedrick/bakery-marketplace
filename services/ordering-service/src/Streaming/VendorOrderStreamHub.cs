using System.Diagnostics.Metrics;
using System.Text.Json;
using System.Threading.Channels;
using BakeryMarketplace.Eventing;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using OrderingService.Api;
using OrderingService.Checkout;
using OrderingService.Persistence;

namespace OrderingService.Streaming;

/// <summary>The broadcast channel a vendor's order changes are published on (ADR-0021 decision 4).</summary>
public static class VendorOrderChannels
{
    public static string For(string vendorId) => $"vendor-orders:{vendorId}";
}

/// <summary>One order change ready to send: the vendor view as JSON, and what the client and the delay metric need.</summary>
public sealed record VendorStreamMessage(string OrderId, long Sequence, string Json, DateTimeOffset UpdatedAt);

/// <summary>One open stream of one vendor. The hub fills the queue; the endpoint drains it onto the connection.</summary>
public sealed class VendorStreamSession : IDisposable
{
    private readonly CancellationTokenSource _closed = new();
    private int _released;

    internal VendorStreamSession(string vendorId, int capacity)
    {
        VendorId = vendorId;
        Queue = Channel.CreateBounded<VendorStreamMessage>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.Wait, // TryWrite then returns false, which the hub treats as a client that cannot keep up
            SingleReader = true,
            SingleWriter = false,
        });
    }

    public string VendorId { get; }
    public Channel<VendorStreamMessage> Queue { get; }

    /// <summary>Why the hub closed this stream (<c>replaced</c>, <c>slow-client</c>, <c>shutdown</c>); null while open or when the client or the token ended it.</summary>
    public string? CloseReason { get; private set; }

    /// <summary>Cancelled when the hub closes the stream.</summary>
    public CancellationToken Closed => _closed.Token;

    internal bool MarkReleased() => Interlocked.Exchange(ref _released, 1) == 0;

    public void Dispose() => _closed.Dispose();

    internal void Close(string reason)
    {
        CloseReason ??= reason;
        try { _closed.Cancel(); } catch (ObjectDisposedException) { }
    }
}

/// <summary>
/// Holds the vendor order streams of this instance (ADR-0021). A vendor's channel is subscribed when their first stream opens on this
/// instance and unsubscribed when the last closes; a message on it is turned into the vendor view once (with the names this instance
/// already holds, no read of the store) and queued for each of that vendor's streams. A message for one vendor is never queued for another's
/// stream: the stream is found by the vendor id of the token that opened it, and the document's own vendor id is checked again.
/// </summary>
public sealed class VendorOrderStreamHub(
    IBroadcastSubscriber broadcast, ListingNameCache names, IOptions<VendorStreamOptions> options, ILogger<VendorOrderStreamHub> logger) : IAsyncDisposable
{
    internal static readonly Meter Meter = new("OrderingService.VendorStreamSession");
    private static readonly UpDownCounter<int> OpenStreams = Meter.CreateUpDownCounter<int>("vendor_stream_open", description: "Open vendor order streams on this instance");
    private static readonly Counter<long> Sent = Meter.CreateCounter<long>("vendor_stream_messages_sent");
    private static readonly Counter<long> Dropped = Meter.CreateCounter<long>("vendor_stream_closed_by_server", description: "Streams the server closed, by reason");
    private static readonly Histogram<double> Delay = Meter.CreateHistogram<double>("vendor_stream_delivery_delay_ms", "ms", "From the event's time to its write on the stream");

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<string, VendorChannel> _vendors = new(StringComparer.Ordinal);
    private int _total;
    private bool _disposed;

    private sealed class VendorChannel
    {
        public IAsyncDisposable Subscription { get; set; } = null!;
        public volatile VendorStreamSession[] Streams = [];
    }

    /// <summary>The number of open streams on this instance.</summary>
    public int OpenCount => Volatile.Read(ref _total);

    /// <summary>Opens a stream for a vendor, or returns null when this instance is at its limit. Throws if the broadcast backend cannot be subscribed.</summary>
    public async Task<VendorStreamSession?> OpenAsync(string vendorId, CancellationToken ct)
    {
        var o = options.Value;
        await _gate.WaitAsync(ct);
        try
        {
            if (_disposed || _total >= o.MaxStreamsPerInstance) return null;

            if (!_vendors.TryGetValue(vendorId, out var vendor))
            {
                var created = new VendorChannel();
                created.Subscription = await broadcast.SubscribeAsync(VendorOrderChannels.For(vendorId), (message, token) => OnMessageAsync(created, vendorId, message, token), ct);
                _vendors[vendorId] = vendor = created;
            }

            var stream = new VendorStreamSession(vendorId, o.QueueCapacity);
            var open = vendor.Streams.Append(stream).ToList();
            while (open.Count > o.MaxStreamsPerVendor)
            {
                var oldest = open[0];
                open.RemoveAt(0);
                Retire(oldest, "replaced");
            }
            vendor.Streams = open.ToArray();
            _total++;
            OpenStreams.Add(1);
            return stream;
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>Removes a stream (idempotent); the vendor's subscription ends with its last stream.</summary>
    public async Task ReleaseAsync(VendorStreamSession stream)
    {
        try
        {
            if (stream.MarkReleased()) await RemoveAsync(stream);
        }
        finally
        {
            stream.Dispose();
        }
    }

    private async Task RemoveAsync(VendorStreamSession stream)
    {
        await _gate.WaitAsync();
        try
        {
            if (!_vendors.TryGetValue(stream.VendorId, out var vendor)) return;
            var remaining = vendor.Streams.Where(s => !ReferenceEquals(s, stream)).ToArray();
            if (remaining.Length != vendor.Streams.Length) // not already retired by the limit or by shutdown
            {
                _total--;
                OpenStreams.Add(-1);
            }
            vendor.Streams = remaining;
            if (remaining.Length == 0)
            {
                _vendors.Remove(stream.VendorId);
                await vendor.Subscription.DisposeAsync();
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    // A stream removed from the list by the limit: counted out here so the caller's later ReleaseAsync does not count it twice.
    private void Retire(VendorStreamSession stream, string reason)
    {
        stream.MarkReleased();
        stream.Close(reason);
        _total--;
        OpenStreams.Add(-1);
        Dropped.Add(1, new KeyValuePair<string, object?>("reason", reason));
    }

    private async Task OnMessageAsync(VendorChannel vendor, string vendorId, string message, CancellationToken ct)
    {
        if (vendor.Streams.Length == 0) return;

        VendorOrderDocument? doc;
        try { doc = JsonConvert.DeserializeObject<VendorOrderDocument>(message); }
        catch (Newtonsoft.Json.JsonException)
        {
            logger.LogWarning("A message on a vendor order channel could not be read and was skipped");
            return;
        }
        if (doc is null || !string.Equals(doc.VendorId, vendorId, StringComparison.Ordinal)) return;

        var known = await names.GetManyAsync((doc.Lines ?? []).Select(l => l.ListingId), ct);
        var json = System.Text.Json.JsonSerializer.Serialize(VendorOrderDto.From(doc, known), Web);
        var item = new VendorStreamMessage(doc.Id, doc.LastSequence, json, doc.UpdatedAt);

        foreach (var stream in vendor.Streams)
        {
            if (stream.Queue.Writer.TryWrite(item)) continue;
            // The client is not reading fast enough: drop it; it reconnects and fetches the list.
            stream.Close("slow-client");
            Dropped.Add(1, new KeyValuePair<string, object?>("reason", "slow-client"));
        }
    }

    internal static void RecordSent(VendorStreamMessage message)
    {
        Sent.Add(1);
        Delay.Record(Math.Max(0, (DateTimeOffset.UtcNow - message.UpdatedAt).TotalMilliseconds));
    }

    public async ValueTask DisposeAsync()
    {
        await _gate.WaitAsync();
        try
        {
            _disposed = true;
            foreach (var vendor in _vendors.Values)
            {
                foreach (var stream in vendor.Streams) Retire(stream, "shutdown");
                vendor.Streams = [];
                await vendor.Subscription.DisposeAsync();
            }
            _vendors.Clear();
        }
        finally
        {
            _gate.Release();
        }
    }
}
