using System.Collections.Concurrent;
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
public sealed partial class VendorOrderStreamHub(
    IBroadcastSubscriber broadcast, ListingNameCache names, IOptions<VendorStreamOptions> options, TimeProvider time, ILogger<VendorOrderStreamHub> logger) : IAsyncDisposable
{
    /// <summary>The name of the hub's meter, for the telemetry registration (ADR-0021, observability).</summary>
    public const string MeterName = "OrderingService.VendorStream";

    /// <summary>
    /// The hub's metrics: how many streams are open, how many messages were written, how many streams the server closed (by reason) and the delay from
    /// an event's time to its write on a stream. Owned by the hub (one per process in the service) so a test can read exactly its own numbers.
    /// </summary>
    private sealed class Metrics : IDisposable
    {
        public Meter Meter { get; } = new(MeterName);
        public UpDownCounter<int> Open { get; }
        public Counter<long> Sent { get; }
        public Counter<long> ClosedByServer { get; }
        public Histogram<double> Delay { get; }

        public Metrics()
        {
            Open = Meter.CreateUpDownCounter<int>("vendor_stream_open", description: "Open vendor order streams on this instance");
            Sent = Meter.CreateCounter<long>("vendor_stream_messages_sent");
            ClosedByServer = Meter.CreateCounter<long>("vendor_stream_closed_by_server", description: "Streams the server closed, by reason");
            Delay = Meter.CreateHistogram<double>("vendor_stream_delivery_delay_ms", "ms", "From the event's time to its write on the stream");
        }

        public void Dispose() => Meter.Dispose();
    }

    private readonly Metrics _metrics = new();

    /// <summary>The hub's meter (for a test to listen to).</summary>
    public Meter Meter => _metrics.Meter;

    // Two JSON libraries on purpose: the broadcast message carries the stored order document, which the Cosmos SDK writes with Newtonsoft, so it
    // is read back with Newtonsoft; the message sent to the browser is camelCase System.Text.Json, like every other response of the service.
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    // One lock per vendor, not one for the hub (register item 125). A vendor's lock makes four things atomic that must not interleave: finding or
    // creating that vendor's single broadcast subscription on this instance; adding or removing one of their streams; retiring their oldest streams
    // beyond the per-vendor limit; and unsubscribing when their last stream goes, so that a stream opening at that moment cannot be left with a
    // subscription that is being disposed. The Redis subscribe is a network call made while holding it, so a slow subscribe delays only that vendor's
    // own opens and closes. The count for the whole instance is under no lock: a place is reserved with an atomic increment before anything is done
    // and given back if it is not used.
    private readonly ConcurrentDictionary<string, VendorChannel> _vendors = new(StringComparer.Ordinal);
    private int _total;
    private volatile bool _disposed;

    private sealed class VendorChannel
    {
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public IAsyncDisposable? Subscription { get; set; }
        public volatile VendorStreamSession[] Streams = [];

        /// <summary>Set, under <see cref="Gate"/>, when the entry has been taken out of the hub. A caller that was waiting for the gate starts again with a new entry.</summary>
        public bool Removed { get; set; }
    }

    /// <summary>The number of open streams on this instance (including a place reserved by an open that is still being set up).</summary>
    public int OpenCount => Volatile.Read(ref _total);

    /// <summary>Opens a stream for a vendor, or returns null when this instance is at its limit. Throws if the broadcast backend cannot be subscribed.</summary>
    public async Task<VendorStreamSession?> OpenAsync(string vendorId, CancellationToken ct)
    {
        var o = options.Value;
        if (_disposed) return null;
        if (Interlocked.Increment(ref _total) > o.MaxStreamsPerInstance)
        {
            Interlocked.Decrement(ref _total);
            return null;
        }

        var placed = false;
        try
        {
            while (true)
            {
                var vendor = _vendors.GetOrAdd(vendorId, _ => new VendorChannel());
                await vendor.Gate.WaitAsync(ct);
                try
                {
                    if (vendor.Removed) continue; // this vendor's last stream closed while this waited: start again with the new entry
                    if (_disposed) return null;

                    if (vendor.Subscription is null)
                    {
                        try
                        {
                            vendor.Subscription = await broadcast.SubscribeAsync(
                                VendorOrderChannels.For(vendorId), (message, token) => OnMessageAsync(vendor, vendorId, message, token), ct);
                        }
                        catch
                        {
                            if (vendor.Streams.Length == 0) Discard(vendorId, vendor); // nothing uses it: the next open starts fresh
                            throw;
                        }
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
                    _metrics.Open.Add(1);
                    placed = true;
                    return stream;
                }
                finally
                {
                    vendor.Gate.Release();
                }
            }
        }
        finally
        {
            if (!placed) Interlocked.Decrement(ref _total); // the place was reserved and not used
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
        if (!_vendors.TryGetValue(stream.VendorId, out var vendor)) return;
        await vendor.Gate.WaitAsync();
        try
        {
            var remaining = vendor.Streams.Where(s => !ReferenceEquals(s, stream)).ToArray();
            if (remaining.Length != vendor.Streams.Length) // not already retired by the limit or by shutdown
            {
                Interlocked.Decrement(ref _total);
                _metrics.Open.Add(-1);
            }
            vendor.Streams = remaining;
            if (remaining.Length == 0)
            {
                Discard(stream.VendorId, vendor);
                if (vendor.Subscription is { } subscription) await subscription.DisposeAsync();
            }
        }
        finally
        {
            vendor.Gate.Release();
        }
    }

    // Takes an entry out of the hub. Called under the entry's gate.
    private void Discard(string vendorId, VendorChannel vendor)
    {
        vendor.Removed = true;
        _vendors.TryRemove(new KeyValuePair<string, VendorChannel>(vendorId, vendor));
    }

    // A stream removed from the list by the limit: counted out here so the caller's later ReleaseAsync does not count it twice.
    private void Retire(VendorStreamSession stream, string reason)
    {
        stream.MarkReleased();
        stream.Close(reason);
        Interlocked.Decrement(ref _total);
        _metrics.Open.Add(-1);
        _metrics.ClosedByServer.Add(1, new KeyValuePair<string, object?>("reason", reason));
    }

    private async Task OnMessageAsync(VendorChannel vendor, string vendorId, string message, CancellationToken ct)
    {
        if (vendor.Streams.Length == 0) return;

        VendorOrderDocument? doc;
        try { doc = JsonConvert.DeserializeObject<VendorOrderDocument>(message); }
        catch (Newtonsoft.Json.JsonException)
        {
            LogOrderMessageSkipped(logger);
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
            _metrics.ClosedByServer.Add(1, new KeyValuePair<string, object?>("reason", "slow-client"));
        }
    }

    /// <summary>Counts a stream the endpoint closed on its own account (for example a client that stopped reading), by reason.</summary>
    internal void RecordClosedByServer(string reason) => _metrics.ClosedByServer.Add(1, new KeyValuePair<string, object?>("reason", reason));

    internal void RecordSent(VendorStreamMessage message)
    {
        _metrics.Sent.Add(1);
        _metrics.Delay.Record(Math.Max(0, (time.GetUtcNow() - message.UpdatedAt).TotalMilliseconds)); // the clock the events were stamped with
    }

    public async ValueTask DisposeAsync()
    {
        _disposed = true;
        foreach (var (vendorId, vendor) in _vendors.ToArray())
        {
            await vendor.Gate.WaitAsync();
            try
            {
                foreach (var stream in vendor.Streams) Retire(stream, "shutdown");
                vendor.Streams = [];
                Discard(vendorId, vendor);
                if (vendor.Subscription is { } subscription) await subscription.DisposeAsync();
            }
            finally
            {
                vendor.Gate.Release();
            }
        }
        _metrics.Dispose();
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "A message on a vendor order channel could not be read and was skipped")]
    private static partial void LogOrderMessageSkipped(ILogger logger);
}
