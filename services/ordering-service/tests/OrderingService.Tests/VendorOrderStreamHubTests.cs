using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OrderingService.Domain;
using OrderingService.Persistence;
using OrderingService.Streaming;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// Register item 125: the hub keeps one lock per vendor, so a slow Redis subscribe for one vendor delays only that vendor, and the guarantees the one
/// lock gave still hold: one subscription per vendor, the limits, and no stream left on a subscription that is being disposed.
/// </summary>
public sealed partial class VendorOrderStreamTests
{
    /// <summary>A subscriber that holds the subscription of one channel until the test lets it go, as a slow Redis would.</summary>
    private sealed class GatedSubscriber(InMemoryBroadcast inner, string blockedChannel) : IBroadcastSubscriber
    {
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default)
        {
            if (channel == blockedChannel)
            {
                Entered.TrySetResult();
                await Release.Task.WaitAsync(ct);
            }
            return await inner.SubscribeAsync(channel, handler, ct);
        }
    }

    private static VendorOrderDocument Doc(int n) =>
        new() { Id = $"order-{n}", VendorId = Seed.Vendor, Status = OrderStatus.Placed, LastSequence = n };

    [Fact]
    public async Task ASlowSubscribeForOneVendorDoesNotDelayAnotherVendorsOpenOrClose()
    {
        var inner = new InMemoryBroadcast();
        var gated = new GatedSubscriber(inner, VendorOrderChannels.For(Seed.Vendor));
        await using var rig = new Rig(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IBroadcastPublisher>(inner));
            services.Replace(ServiceDescriptor.Singleton<IBroadcastSubscriber>(gated));
        });
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();

        var slowOpen = hub.OpenAsync(Seed.Vendor, CancellationToken.None); // stuck inside the subscribe
        await gated.Entered.Task.WaitAsync(Wait);

        var other = await hub.OpenAsync("vendor-other-002", CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(3)); // must not wait for it
        Assert.NotNull(other);
        await hub.ReleaseAsync(other).WaitAsync(TimeSpan.FromSeconds(3)); // nor must closing

        gated.Release.SetResult();
        var first = await slowOpen.WaitAsync(Wait);
        Assert.NotNull(first);
        await hub.ReleaseAsync(first);
        Assert.Equal(0, hub.OpenCount);
        Assert.Equal(0, inner.SubscriberCount(VendorOrderChannels.For(Seed.Vendor)));
    }

    [Fact]
    public async Task ManyOpensAtOnceForOneVendorKeepTheLimitOneSubscriptionAndAnExactCount()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerVendor", "5"));
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        var broadcast = (InMemoryBroadcast)rig.Factory.Services.GetRequiredService<IBroadcastSubscriber>();
        var channel = VendorOrderChannels.For(Seed.Vendor);

        var opened = await Task.WhenAll(Enumerable.Range(0, 40).Select(_ => Task.Run(() => hub.OpenAsync(Seed.Vendor, CancellationToken.None))));

        Assert.All(opened, s => Assert.NotNull(s));
        Assert.Equal(5, hub.OpenCount); // 35 were retired by the limit
        Assert.Equal(1, broadcast.SubscriberCount(channel)); // one subscription for the vendor, however many opened at once
        foreach (var s in opened) await hub.ReleaseAsync(s!);
        Assert.Equal(0, hub.OpenCount);
        Assert.Equal(0, broadcast.SubscriberCount(channel));
    }

    [Fact]
    public async Task ManyOpensAtOnceNeverExceedThePerInstanceLimit()
    {
        await using var rig = new Rig(("VendorStream:MaxStreamsPerInstance", "10"), ("VendorStream:MaxStreamsPerVendor", "50"));
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();

        var opened = await Task.WhenAll(Enumerable.Range(0, 60).Select(i => Task.Run(() => hub.OpenAsync($"vendor-{i % 12}", CancellationToken.None))));

        Assert.Equal(10, opened.Count(s => s is not null));
        Assert.Equal(10, hub.OpenCount);
        foreach (var s in opened.OfType<VendorStreamSession>()) await hub.ReleaseAsync(s);
        Assert.Equal(0, hub.OpenCount);
        // and the refused ones gave their reserved place back: all ten places can be used again
        var again = await Task.WhenAll(Enumerable.Range(0, 10).Select(i => hub.OpenAsync($"vendor-{i}", CancellationToken.None)));
        Assert.All(again, s => Assert.NotNull(s));
    }

    [Fact]
    public async Task ACloseThatRacesAnOpenNeverLeavesTheNewStreamOnADisposedSubscription()
    {
        await using var rig = new Rig();
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();
        var publisher = rig.Factory.Services.GetRequiredService<IBroadcastPublisher>();
        var broadcast = (InMemoryBroadcast)rig.Factory.Services.GetRequiredService<IBroadcastSubscriber>();
        var channel = VendorOrderChannels.For(Seed.Vendor);

        for (var round = 1; round <= 200; round++)
        {
            var first = await hub.OpenAsync(Seed.Vendor, CancellationToken.None);
            var closing = hub.ReleaseAsync(first!); // the last stream is going...
            var second = await hub.OpenAsync(Seed.Vendor, CancellationToken.None); // ...while a new one opens
            await closing;

            await publisher.PublishAsync(channel, Newtonsoft.Json.JsonConvert.SerializeObject(Doc(round)));
            await WaitUntilAsync(() => second!.Queue.Reader.Count > 0); // the new stream is still being fed
            await hub.ReleaseAsync(second!);

            Assert.Equal(0, broadcast.SubscriberCount(channel));
            Assert.Equal(0, hub.OpenCount);
        }
    }

    [Fact]
    public async Task AFailedSubscribeLeavesNothingBehindAndTheNextOpenTriesAgain()
    {
        var inner = new InMemoryBroadcast();
        var flaky = new FlakySubscriber(inner);
        await using var rig = new Rig(services =>
        {
            services.Replace(ServiceDescriptor.Singleton<IBroadcastPublisher>(inner));
            services.Replace(ServiceDescriptor.Singleton<IBroadcastSubscriber>(flaky));
        });
        _ = rig.Factory.CreateClient();
        var hub = rig.Factory.Services.GetRequiredService<VendorOrderStreamHub>();

        await Assert.ThrowsAsync<InvalidOperationException>(() => hub.OpenAsync(Seed.Vendor, CancellationToken.None));
        Assert.Equal(0, hub.OpenCount); // the reserved place was given back

        flaky.Fail = false;
        var stream = await hub.OpenAsync(Seed.Vendor, CancellationToken.None);
        Assert.NotNull(stream);
        Assert.Equal(1, hub.OpenCount);
        await hub.ReleaseAsync(stream);
    }

    private sealed class FlakySubscriber(InMemoryBroadcast inner) : IBroadcastSubscriber
    {
        public bool Fail { get; set; } = true;

        public Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default) =>
            Fail ? throw new InvalidOperationException("Redis is down") : inner.SubscribeAsync(channel, handler, ct);
    }
}
