using BakeryMarketplace.Chaos;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// With every chaos setting off, the decorator must be invisible: the whole shared transport contract passes through it. WI-EVT-004.
/// </summary>
public sealed class ChaosEventTransportContractTests : EventTransportContractTests
{
    protected override (IEventPublisher Publisher, IEventSubscriber Subscriber) CreateTransportPair()
    {
        var inner = new InMemoryEventTransport();
        var chaos = new ChaosEventTransport(inner, inner, ChaosRuntime.ForTests(ChaosScenario.Of("off", 1, "events")));
        return (chaos, chaos);
    }
}

/// <summary>
/// Proves each injected failure happens and is journaled, and that the parts of the design that must survive it do: the outbox's ordered publishing
/// (nothing overtakes a failed event, everything is sent after recovery), the at-least-once duplicate and the late, out-of-order event that
/// consumers must tolerate. Every test that asserts the system coped first asserts the journal shows the fault, so none can pass with chaos off.
/// </summary>
public sealed class ChaosEventTransportTests
{
    private static DomainEventEnvelope<string> Make(string payload, long sequence = 1, string eventType = "ChaosTest") =>
        new(Guid.NewGuid(), eventType, 1, DateTimeOffset.UtcNow, "TestAggregate", "agg-1", sequence, payload);

    private static (ChaosEventTransport Chaos, ChaosRuntime Runtime) Build(long seed, params (string Setting, double Value)[] settings)
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("test", seed, "events", settings));
        var inner = new InMemoryEventTransport();
        return (new ChaosEventTransport(inner, inner, runtime), runtime);
    }

    private static (ChaosEventTransport Chaos, ChaosRuntime Runtime) Build(params (string Setting, double Value)[] settings) => Build(1, settings);

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
    public async Task PublishFailureRateOfOne_FailsEveryPublish_DeliversNothing_AndIsJournaled()
    {
        var (chaos, runtime) = Build(("publishFailureRate", 1.0));
        var received = await Collect(chaos);

        await Assert.ThrowsAsync<EventTransportException>(() => chaos.PublishAsync(Make("a")));

        Assert.Equal(1, runtime.Journal.Count("events", "publishFailure"));
        Assert.Empty(received);
    }

    [Fact]
    public async Task OutageWindow_FailsPublishes_ThenRecovers()
    {
        var (chaos, runtime) = Build(("outageWindowSeconds", 0.2));
        var received = await Collect(chaos);

        await Assert.ThrowsAsync<EventTransportException>(() => chaos.PublishAsync(Make("during")));
        await Task.Delay(300);
        await chaos.PublishAsync(Make("after"));

        Assert.Equal(1, runtime.Journal.Count("events", "outage"));
        Assert.Equal(new[] { "after" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task Latency_DelaysThePublish()
    {
        var (chaos, runtime) = Build(("latencyMs", 150));
        await Collect(chaos);

        var started = DateTime.UtcNow;
        await chaos.PublishAsync(Make("slow"));

        Assert.Equal(1, runtime.Journal.Count("events", "latency"));
        Assert.True(DateTime.UtcNow - started >= TimeSpan.FromMilliseconds(120));
    }

    [Fact]
    public async Task DuplicateRateOfOne_DeliversTheSameEventIdTwice()
    {
        var (chaos, runtime) = Build(("duplicateRate", 1.0));
        var received = await Collect(chaos);
        var envelope = Make("twice");

        await chaos.PublishAsync(envelope);

        Assert.Equal(1, runtime.Journal.Count("events", "duplicate"));
        Assert.Equal(2, received.Count);
        Assert.All(received, e => Assert.Equal(envelope.EventId, e.EventId));
    }

    [Fact]
    public async Task LostResponse_DeliversTheEvent_ButThePublisherIsToldItFailed_SoTheOutboxPublishesItAgain()
    {
        // publishLostResponseRate is keyed by the attempt: with 1.0 every attempt loses its response, so a retry of the same event delivers it again.
        var (chaos, runtime) = Build(("publishLostResponseRate", 1.0));
        var received = await Collect(chaos);
        var envelope = Make("sent-but-unconfirmed");

        await Assert.ThrowsAsync<EventTransportException>(() => chaos.PublishAsync(envelope));
        await Assert.ThrowsAsync<EventTransportException>(() => chaos.PublishAsync(envelope)); // the outbox's retry

        Assert.Equal(2, runtime.Journal.Count("events", "lostResponse"));
        Assert.Equal(2, received.Count); // delivered twice, both times with the same id: consumers must be idempotent
        Assert.All(received, e => Assert.Equal(envelope.EventId, e.EventId));
    }

    [Fact]
    public async Task DropRateOfOne_ReportsSuccess_ButDeliversNothing()
    {
        var (chaos, runtime) = Build(("dropRate", 1.0));
        var received = await Collect(chaos);

        await chaos.PublishAsync(Make("lost")); // no exception: the publisher believes it was sent

        Assert.Equal(1, runtime.Journal.Count("events", "drop"));
        Assert.Empty(received);
    }

    [Fact]
    public async Task ReorderRateOfOne_DeliversAnEventAfterTheOneThatWasPublishedLater()
    {
        var (chaos, runtime) = Build(("reorderRate", 1.0));
        var received = await Collect(chaos);

        await chaos.PublishAsync(Make("first", 1)); // held back
        Assert.Empty(received);
        await chaos.PublishAsync(Make("second", 2)); // goes out, then releases the first

        Assert.Equal(1, runtime.Journal.Count("events", "reorder"));
        Assert.Equal(new[] { "second", "first" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task ReleaseHeld_DeliversALastEventThatNothingFollowed()
    {
        var (chaos, _) = Build(("reorderRate", 1.0));
        var received = await Collect(chaos);

        await chaos.PublishAsync(Make("only"));
        await chaos.ReleaseHeldAsync();

        Assert.Equal(new[] { "only" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task ConsumerThatChecksSequenceNumbers_CopesWithOutOfOrderDelivery()
    {
        var (chaos, runtime) = Build(("reorderRate", 1.0));
        long highest = 0;
        var applied = new List<string>();
        await chaos.SubscribeAsync<string>("ChaosTest", (e, _) =>
        {
            if (e.SequenceNumber > highest) { highest = e.SequenceNumber; applied.Add(e.Payload); } // a stale event is ignored
            return Task.CompletedTask;
        });

        await chaos.PublishAsync(Make("v1", 1));
        await chaos.PublishAsync(Make("v2", 2));

        Assert.Equal(1, runtime.Journal.Count("events", "reorder"));
        Assert.Equal(new[] { "v2" }, applied); // the newer state wins; v1 arrived late and was ignored
    }

    [Fact]
    public async Task HandlerFailureRateOfOne_FailsTheHandler_WithoutRunningIt()
    {
        var (chaos, runtime) = Build(("handlerFailureRate", 1.0));
        var ran = 0;
        await chaos.SubscribeAsync<string>("ChaosTest", (_, _) => { ran++; return Task.CompletedTask; });

        // In memory a failing handler throws to the publisher; Redis would leave the event pending for redelivery.
        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("x")));

        Assert.Equal(1, runtime.Journal.Count("events", "handlerFailure"));
        Assert.Equal(0, ran);
    }

    [Fact]
    public async Task BatchHandlerFailure_ReportsTheEventAsFailed_WithoutRunningTheHandler()
    {
        var (chaos, runtime) = Build(("handlerFailureRate", 1.0));
        var ran = 0;
        await chaos.SubscribeBatchAsync<string>("ChaosTest", (_, _) =>
        {
            ran++;
            return Task.FromResult<IReadOnlyCollection<Guid>>(Array.Empty<Guid>());
        });

        // The in-memory transport turns a non-empty failed list into an exception for the publisher.
        await Assert.ThrowsAsync<InvalidOperationException>(() => chaos.PublishAsync(Make("x")));

        Assert.Equal(1, runtime.Journal.Count("events", "handlerFailure"));
        Assert.Equal(0, ran);
    }

    [Fact]
    public async Task TheSameSeedFailsTheSameEvents_AnotherSeedFailsOthers_AndARetryOfAnEventIsJudgedAfresh()
    {
        var ids = Enumerable.Range(0, 40).Select(_ => Guid.NewGuid()).ToList(); // fixed across runs

        async Task<string> Run(long seed)
        {
            var (chaos, _) = Build(seed, ("publishFailureRate", 0.5));
            await Collect(chaos);
            var outcome = "";
            foreach (var id in ids)
            {
                try { await chaos.PublishAsync(Make("p") with { EventId = id }); outcome += "o"; }
                catch (EventTransportException) { outcome += "x"; }
            }

            return outcome;
        }

        var first = await Run(42);
        Assert.Equal(first, await Run(42));
        Assert.NotEqual(first, await Run(43));
        Assert.Contains('o', first); // a rate of 0.5 over 40 events neither always fails nor never fails
        Assert.Contains('x', first);

        // The outbox retries the same event: each attempt has its own decision, so an event that failed once is not a poison pill.
        var (retrying, runtime) = Build(7, ("publishFailureRate", 0.5));
        await Collect(retrying);
        var envelope = Make("retried");
        var attempts = 0;
        while (attempts < 50)
        {
            attempts++;
            try { await retrying.PublishAsync(envelope); break; }
            catch (EventTransportException) { }
        }

        Assert.True(attempts < 50, "a retried event must eventually get through");
        Assert.Equal(attempts - 1, runtime.Journal.Count("events", "publishFailure"));
    }

    [Fact]
    public async Task OutboxOrderedPublishing_StopsAtTheFirstChaosFailure_AndNothingOvertakesIt()
    {
        // The outbox relay's rule (register 74): a later event of a document must not be sent before an earlier one has been.
        var (chaos, runtime) = Build(("outageWindowSeconds", 0.25));
        var received = await Collect(chaos);
        var pending = Enumerable.Range(1, 4).Select(i => Make($"e{i}", i)).ToList();
        var failures = new List<string>();

        var outcome = await OutboxPublishing.PublishInOrderAsync(
            pending, e => e.EventId.ToString(), (e, ct) => chaos.PublishAsync(e, ct), (e, _) => failures.Add(e.Payload), CancellationToken.None);

        Assert.Equal(1, runtime.Journal.Count("events", "outage")); // the fault happened, once: e2 to e4 were never tried
        Assert.Empty(outcome.PublishedIds);
        Assert.Equal("e1", outcome.Failed!.Payload);
        Assert.Equal(new[] { "e1" }, failures);
        Assert.Empty(received);

        await Task.Delay(350); // the outage ends; the next sweep sends everything, in order
        var retry = await OutboxPublishing.PublishInOrderAsync(
            pending, e => e.EventId.ToString(), (e, ct) => chaos.PublishAsync(e, ct), (_, _) => { }, CancellationToken.None);

        Assert.Null(retry.Failed);
        Assert.Equal(new[] { "e1", "e2", "e3", "e4" }, received.Select(e => e.Payload));
    }

    [Fact]
    public async Task IdempotentConsumer_ToleratesTheDuplicateTheTransportMayDeliver()
    {
        var (chaos, runtime) = Build(("duplicateRate", 1.0));
        var seen = new HashSet<Guid>();
        var deliveries = 0;
        var effects = 0;
        await chaos.SubscribeAsync<string>("ChaosTest", (e, _) =>
        {
            deliveries++;
            if (seen.Add(e.EventId)) effects++; // the rule every consumer follows (ADR-0003)
            return Task.CompletedTask;
        });

        for (var i = 0; i < 5; i++) await chaos.PublishAsync(Make($"p{i}"));

        Assert.Equal(5, runtime.Journal.Count("events", "duplicate"));
        Assert.Equal(10, deliveries);
        Assert.Equal(5, effects);
    }
}
