using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Domain;
using OrderingService.Persistence;
using OrderingService.Streaming;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// Review decision F (WI-QUE-003): a client that holds the connection open and does not read must not hold a stream's place and a blocked write for
/// as long as its token lives. Every write has a time limit; when it passes, the stream is closed and the connection dropped.
/// </summary>
public sealed partial class VendorOrderStreamTests
{
    [Fact]
    public async Task AClientThatHoldsTheConnectionAndDoesNotReadIsClosedWhenAWriteTakesTooLong()
    {
        await using var rig = new Rig(("VendorStream:WriteTimeout", "00:00:00.300"));
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        var publisher = rig.Factory.Services.GetRequiredService<IBroadcastPublisher>();
        using var meter = new MeterReader(hub.Meter);
        using var vendor = rig.Vendor();

        // The response is opened and then never read, so the pipe to this client fills and a write blocks.
        using var silent = await Sse.OpenAsync(vendor);
        await WaitUntilAsync(() => hub.OpenCount == 1);

        var big = new string('x', 30_000); // ten of these are far more than the pipe to an unread client holds
        for (var i = 1; i <= 10; i++)
        {
            var doc = new VendorOrderDocument { Id = $"order-{i}", VendorId = Seed.Vendor, Status = OrderStatus.Placed, LastSequence = i, PickupInstructions = big };
            await publisher.PublishAsync(VendorOrderChannels.For(Seed.Vendor), Newtonsoft.Json.JsonConvert.SerializeObject(doc));
        }

        await WaitUntilAsync(() => hub.OpenCount == 0); // its place is free again
        Assert.Equal(1, meter.Sum("vendor_stream_closed_by_server", "write-timeout"));
    }

    [Fact]
    public async Task AClientThatReadsIsNotAffectedByTheWriteTimeout()
    {
        await using var rig = new Rig(("VendorStream:WriteTimeout", "00:00:00.300"));
        using var vendor = rig.Vendor();
        using var stream = await Sse.OpenAsync(vendor);
        await stream.NextAsync();

        await Task.Delay(700); // longer than the timeout: only a write that is stuck is cut, not a quiet stream
        var id = await rig.PlaceOrderAsync();

        Assert.Equal(id, Json(await stream.NextEventAsync("order")).GetProperty("id").GetString());
    }
}
