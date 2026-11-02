using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Streaming;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// WI-QUE-003 step 7 (ADR-0021, observability): the stream's numbers are the ones an operator is promised: how many streams are open, how many
/// messages were written, how many streams the server closed and why, and the delay from an event to its write on a stream.
/// </summary>
public sealed partial class VendorOrderStreamTests
{
    /// <summary>Records what one hub's meter reports. Reading the hub's own meter keeps tests that run side by side apart.</summary>
    private sealed class MeterReader : IDisposable
    {
        private readonly MeterListener _listener = new();
        private readonly ConcurrentQueue<(string Name, double Value, string? Reason)> _seen = new();

        public MeterReader(Meter meter)
        {
            _listener.InstrumentPublished = (instrument, listener) =>
            {
                if (ReferenceEquals(instrument.Meter, meter)) listener.EnableMeasurementEvents(instrument);
            };
            _listener.SetMeasurementEventCallback<int>((i, v, tags, _) => Add(i.Name, v, tags));
            _listener.SetMeasurementEventCallback<long>((i, v, tags, _) => Add(i.Name, v, tags));
            _listener.SetMeasurementEventCallback<double>((i, v, tags, _) => Add(i.Name, v, tags));
            _listener.Start();
        }

        private void Add(string name, double value, ReadOnlySpan<KeyValuePair<string, object?>> tags)
        {
            string? reason = null;
            foreach (var tag in tags) if (tag.Key == "reason") reason = tag.Value as string;
            _seen.Enqueue((name, value, reason));
        }

        public double Sum(string name, string? reason = null) => _seen.Where(m => m.Name == name && (reason is null || m.Reason == reason)).Sum(m => m.Value);
        public double[] Values(string name) => _seen.Where(m => m.Name == name).Select(m => m.Value).ToArray();
        public void Dispose() => _listener.Dispose();
    }

    [Fact]
    public async Task TheMetricsCountOpenStreamsMessagesWrittenAndTheDelayOfEachOne()
    {
        await using var rig = new Rig();
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        using var meter = new MeterReader(hub.Meter);
        using var vendor = rig.Vendor();

        using (var stream = await Sse.OpenAsync(vendor))
        {
            await stream.NextAsync();
            Assert.Equal(1, meter.Sum("vendor_stream_open"));

            await rig.PlaceOrderAsync();
            await stream.NextEventAsync("order");
            await WaitUntilAsync(() => meter.Sum("vendor_stream_messages_sent") == 1);

            var delay = Assert.Single(meter.Values("vendor_stream_delivery_delay_ms"));
            Assert.InRange(delay, 0, 5000); // event to write, in milliseconds, on one machine
        }

        await WaitUntilAsync(() => meter.Sum("vendor_stream_open") == 0);
    }

    [Fact]
    public async Task TheMetricsCountTheStreamsTheServerClosedByReason()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerVendor", "1"), ("VendorStream:QueueCapacity", "1"));
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        using var meter = new MeterReader(hub.Meter);
        using var vendor = rig.Vendor();

        using var first = await Sse.OpenAsync(vendor);
        using var second = await Sse.OpenAsync(vendor); // replaces the first
        await first.NextEventAsync("closed");

        Assert.Equal(1, meter.Sum("vendor_stream_closed_by_server", "replaced"));
        Assert.Equal(0, meter.Sum("vendor_stream_closed_by_server", "slow-client"));
        Assert.Equal(1, meter.Sum("vendor_stream_open")); // two opened, one closed by the server
    }
}
