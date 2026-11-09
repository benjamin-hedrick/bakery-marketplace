using BakeryMarketplace.Chaos;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>With every setting off the broadcast decorators are invisible: the shared broadcast contract passes through them (WI-CHAOS-002).</summary>
public sealed class ChaosBroadcastContractTests : BroadcastContractTests
{
    private readonly InMemoryBroadcast _backend = new();

    protected override (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateInstance()
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("off", 1, "broadcast"));
        return (new ChaosBroadcastPublisher(_backend, runtime), new ChaosBroadcastSubscriber(_backend, runtime));
    }
}

/// <summary>
/// The broadcast layer: a failed publish, a lost one, a lost delivery, slowness and an outage window, each journaled. Chaos must never turn a lost
/// nudge into anything worse than a lost nudge: the vendor screens' polling is the fallback (ADR-0021).
/// </summary>
public sealed class ChaosBroadcastTests
{
    private static (ChaosBroadcastPublisher Publisher, ChaosBroadcastSubscriber Subscriber, ChaosRuntime Runtime, List<string> Received) Build(
        params (string Setting, double Value)[] settings)
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("broadcast-test", 1, "broadcast", settings));
        var backend = new InMemoryBroadcast();
        return (new ChaosBroadcastPublisher(backend, runtime), new ChaosBroadcastSubscriber(backend, runtime), runtime, []);
    }

    // In-memory delivery to a subscriber is asynchronous, so a delivery-side effect is waited for rather than read straight after the publish.
    private static async Task Eventually(Func<bool> condition)
    {
        var until = DateTime.UtcNow.AddSeconds(5);
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(20);
    }

    private static async Task Listen(ChaosBroadcastSubscriber subscriber, List<string> received) =>
        await subscriber.SubscribeAsync("vendor:1", (message, _) =>
        {
            lock (received) received.Add(message);
            return Task.CompletedTask;
        });

    [Fact]
    public async Task FailureRateOfOne_FailsThePublish_AndNothingIsDelivered()
    {
        var (publisher, subscriber, runtime, received) = Build(("failureRate", 1));
        await Listen(subscriber, received);

        await Assert.ThrowsAsync<InvalidOperationException>(() => publisher.PublishAsync("vendor:1", "changed"));

        Assert.Equal(1, runtime.Journal.Count("broadcast", "failure"));
        Assert.Empty(received);
    }

    [Fact]
    public async Task DropRateOfOne_ReportsSuccess_ButTheNudgeIsLost_AndTheMessageTextIsNotJournaled()
    {
        var (publisher, subscriber, runtime, received) = Build(("dropRate", 1));
        await Listen(subscriber, received);

        await publisher.PublishAsync("vendor:1", "order-secret-text"); // no exception

        Assert.Equal(1, runtime.Journal.Count("broadcast", "drop"));
        Assert.Empty(received);
        Assert.DoesNotContain(runtime.Journal.Entries, e => e.Key.Contains("secret"));
    }

    [Fact]
    public async Task DeliveryDropRateOfOne_PublishesButTheSubscribersHandlerNeverRuns()
    {
        var (publisher, subscriber, runtime, received) = Build(("deliveryDropRate", 1));
        await Listen(subscriber, received);

        await publisher.PublishAsync("vendor:1", "changed");
        await Eventually(() => runtime.Journal.Count("broadcast", "deliveryDrop") == 1);

        Assert.Equal(1, runtime.Journal.Count("broadcast", "deliveryDrop"));
        Assert.Empty(received);
    }

    [Fact]
    public async Task OutageWindow_FailsPublishes_ThenRecovers()
    {
        var (publisher, subscriber, runtime, received) = Build(("outageWindowSeconds", 0.2));
        await Listen(subscriber, received);

        await Assert.ThrowsAsync<InvalidOperationException>(() => publisher.PublishAsync("vendor:1", "during"));
        await Task.Delay(300);
        await publisher.PublishAsync("vendor:1", "after");
        await Eventually(() => received.Count == 1);

        Assert.Equal(1, runtime.Journal.Count("broadcast", "outage"));
        Assert.Equal(new[] { "after" }, received);
    }

    [Fact]
    public async Task Latency_DelaysThePublish()
    {
        var (publisher, subscriber, runtime, received) = Build(("latencyMs", 150));
        await Listen(subscriber, received);

        var started = DateTime.UtcNow;
        await publisher.PublishAsync("vendor:1", "slow");
        var publishTook = DateTime.UtcNow - started;
        await Eventually(() => received.Count == 1);

        Assert.True(runtime.Journal.Count("broadcast", "latency") >= 1);
        Assert.True(publishTook >= TimeSpan.FromMilliseconds(120));
        Assert.Equal(new[] { "slow" }, received);
    }
}
