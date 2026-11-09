using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// With every chaos setting off, the decorator must be invisible: the whole shared transport contract passes through it. WI-EVT-004.
/// </summary>
public sealed class ChaosEventTransportContractTests : EventTransportContractTests
{
    protected override (IEventPublisher Publisher, IEventSubscriber Subscriber) CreateTransportPair()
    {
        var inner = new InMemoryEventTransport();
        var chaos = new ChaosEventTransport(inner, inner, new ChaosEventOptions(), isProduction: false);
        return (chaos, chaos);
    }
}

/// <summary>
/// Proves each injected failure happens, and that the parts of the design that must survive it do: the outbox's ordered publishing
/// (nothing overtakes a failed event, everything is sent after recovery) and the at-least-once duplicate that consumers must tolerate.
/// </summary>
public sealed class ChaosEventTransportTests
{
    private static DomainEventEnvelope<string> Make(string payload, long sequence = 1, string eventType = "ChaosTest") =>
        new(Guid.NewGuid(), eventType, 1, DateTimeOffset.UtcNow, "TestAggregate", "agg-1", sequence, payload);

    private static (ChaosEventTransport Chaos, InMemoryEventTransport Inner) Build(ChaosEventOptions options)
    {
        var inner = new InMemoryEventTransport();
        return (new ChaosEventTransport(inner, inner, options, isProduction: false), inner);
    }

    private static async Task<List<DomainEventEnvelope<string>>> Collect(IEventSubscriber subscriber, string eventType = "ChaosTest")
    {
        var received = new List<DomainEventEnvelope<string>>();
        await subscriber.SubscribeAsync<string>(eventType, (e, _) =>
        {
            lock (received) received.Add(e);
            return Task.CompletedTask;
        });
        return received;
    }

    [Fact]
    public async Task PublishFailureRateOfOne_FailsEveryPublish_AndDeliversNothing()
    {
        var (chaos, _) = Build(new ChaosEventOptions { PublishFailureRate = 1.0 });
        var received = await Collect(chaos);

        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("a")));

        Assert.Empty(received);
    }

    [Fact]
    public async Task OutageWindow_FailsPublishes_ThenRecovers()
    {
        var (chaos, _) = Build(new ChaosEventOptions { OutageWindow = TimeSpan.FromMilliseconds(200) });
        var received = await Collect(chaos);

        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("during")));
        await Task.Delay(300);
        await chaos.PublishAsync(Make("after"));

        Assert.Equal(new[] { "after" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task InjectedLatency_DelaysThePublish()
    {
        var (chaos, _) = Build(new ChaosEventOptions { InjectedLatency = TimeSpan.FromMilliseconds(150) });
        await Collect(chaos);

        var started = DateTime.UtcNow;
        await chaos.PublishAsync(Make("slow"));

        Assert.True(DateTime.UtcNow - started >= TimeSpan.FromMilliseconds(120));
    }

    [Fact]
    public async Task DuplicateRateOfOne_DeliversTheSameEventIdTwice()
    {
        var (chaos, _) = Build(new ChaosEventOptions { DuplicateRate = 1.0 });
        var received = await Collect(chaos);
        var envelope = Make("twice");

        await chaos.PublishAsync(envelope);

        Assert.Equal(2, received.Count);
        Assert.All(received, e => Assert.Equal(envelope.EventId, e.EventId));
    }

    [Fact]
    public async Task DropRateOfOne_ReportsSuccess_ButDeliversNothing()
    {
        var (chaos, _) = Build(new ChaosEventOptions { DropRate = 1.0 });
        var received = await Collect(chaos);

        await chaos.PublishAsync(Make("lost")); // no exception: the publisher believes it was sent

        Assert.Empty(received);
    }

    [Fact]
    public async Task HandlerFailureRateOfOne_FailsTheHandler_WithoutRunningIt()
    {
        var (chaos, _) = Build(new ChaosEventOptions { HandlerFailureRate = 1.0 });
        var ran = 0;
        await chaos.SubscribeAsync<string>("ChaosTest", (_, _) => { ran++; return Task.CompletedTask; });

        // In memory a failing handler throws to the publisher; Redis would leave the event pending for redelivery.
        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("x")));

        Assert.Equal(0, ran);
    }

    [Fact]
    public async Task BatchHandlerFailure_ReportsTheEventAsFailed_WithoutRunningTheHandler()
    {
        var (chaos, _) = Build(new ChaosEventOptions { HandlerFailureRate = 1.0 });
        var ran = 0;
        await chaos.SubscribeBatchAsync<string>("ChaosTest", (_, _) =>
        {
            ran++;
            return Task.FromResult<IReadOnlyCollection<Guid>>(Array.Empty<Guid>());
        });

        // The in-memory transport turns a non-empty failed list into an exception for the publisher.
        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("x")));

        Assert.Equal(0, ran);
    }

    [Fact]
    public async Task Seed_MakesRandomFailuresRepeatable()
    {
        async Task<string> Run()
        {
            var (chaos, _) = Build(new ChaosEventOptions { PublishFailureRate = 0.5, Seed = 42 });
            await Collect(chaos);
            var outcome = "";
            for (var i = 0; i < 20; i++)
            {
                try { await chaos.PublishAsync(Make("p")); outcome += "o"; }
                catch (InvalidOperationException) { outcome += "x"; }
            }
            return outcome;
        }

        var first = await Run();
        Assert.Equal(first, await Run());
        Assert.Contains('o', first); // a rate of 0.5 over 20 tries neither always fails nor never fails
        Assert.Contains('x', first);
    }

    [Fact]
    public async Task OutboxOrderedPublishing_StopsAtTheFirstChaosFailure_AndNothingOvertakesIt()
    {
        // The outbox relay's rule (register 74): a later event of a document must not be sent before an earlier one has been.
        var inner = new InMemoryEventTransport();
        var chaos = new ChaosEventTransport(inner, inner, new ChaosEventOptions { OutageWindow = TimeSpan.FromMilliseconds(250) }, isProduction: false);
        var received = await Collect(chaos);
        var pending = Enumerable.Range(1, 4).Select(i => Make($"e{i}", i)).ToList();
        var failures = new List<string>();

        var outcome = await OutboxPublishing.PublishInOrderAsync(
            pending, e => e.EventId.ToString(), (e, ct) => chaos.PublishAsync(e, ct), (e, _) => failures.Add(e.Payload), CancellationToken.None);

        Assert.Empty(outcome.PublishedIds);
        Assert.Equal("e1", outcome.Failed!.Payload);
        Assert.Equal(new[] { "e1" }, failures);
        Assert.Empty(received); // e2 to e4 were not tried, so none could overtake e1

        await Task.Delay(350); // the outage ends; the next sweep sends everything, in order
        var retry = await OutboxPublishing.PublishInOrderAsync(
            pending, e => e.EventId.ToString(), (e, ct) => chaos.PublishAsync(e, ct), (_, _) => { }, CancellationToken.None);

        Assert.Null(retry.Failed);
        Assert.Equal(new[] { "e1", "e2", "e3", "e4" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task IdempotentConsumer_ToleratesTheDuplicateTheTransportMayDeliver()
    {
        var (chaos, _) = Build(new ChaosEventOptions { DuplicateRate = 1.0 });
        var seen = new HashSet<Guid>();
        var effects = 0;
        await chaos.SubscribeAsync<string>("ChaosTest", (e, _) =>
        {
            if (seen.Add(e.EventId)) effects++; // the rule every consumer follows (ADR-0003)
            return Task.CompletedTask;
        });

        for (var i = 0; i < 5; i++) await chaos.PublishAsync(Make($"p{i}"));

        Assert.Equal(5, effects);
    }

    [Fact]
    public void ProductionGating_ThrowsAtConstruction_WhenIsProductionTrue()
    {
        var inner = new InMemoryEventTransport();
        Assert.Throws<InvalidOperationException>(() =>
            new ChaosEventTransport(inner, inner, new ChaosEventOptions { PublishFailureRate = 1.0 }, isProduction: true));
    }

    [Fact]
    public void ProductionGating_AddChaosEventTransport_ThrowsForProductionEnvironment()
    {
        var inner = new InMemoryEventTransport();
        Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddChaosEventTransport(inner, inner, new ChaosEventOptions(), new FakeHostEnvironment("Production")));
    }

    [Fact]
    public void AddChaosEventTransport_RegistersTheDecoratorOutsideProduction()
    {
        var inner = new InMemoryEventTransport();
        var services = new ServiceCollection()
            .AddChaosEventTransport(inner, inner, new ChaosEventOptions(), new FakeHostEnvironment("Development"));

        var publisher = Assert.Single(services, d => d.ServiceType == typeof(IEventPublisher)).ImplementationInstance;
        var subscriber = Assert.Single(services, d => d.ServiceType == typeof(IEventSubscriber)).ImplementationInstance;
        Assert.IsType<ChaosEventTransport>(publisher);
        Assert.Same(publisher, subscriber);
    }

    private sealed class FakeHostEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "ChaosEventTransportTests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
