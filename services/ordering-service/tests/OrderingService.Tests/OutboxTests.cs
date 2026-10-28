using System.Diagnostics;
using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.Logging.Abstractions;
using Newtonsoft.Json.Linq;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Outbox;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>WI-ORD-005: events are stored with the order, published inline, and swept up by the relay when the inline path misses.</summary>
public class OutboxTests
{
    private static OrderStore NewStore() => new(new FakeRepository<OrderDocument>(d => d.Id));

    private static Order PlacedWithEvent(string id = "order-1", string customer = "customer-1")
    {
        var order = Order.Create(id, customer, "vendor-1", FulfillmentType.Pickup, T0);
        order.AddLine(Line(), At(1));
        order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(At(60), At(75)), At(2));
        order.Place(At(3));
        return order;
    }

    // ---- the store: the order and its events are one write ----------------------------------------

    [Fact]
    public async Task CreatingAnOrderStoresItsPlacedEventInTheSameDocument()
    {
        var store = NewStore();

        var created = await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1");

        var entry = Assert.Single(created!.Document.Outbox);
        Assert.Equal(OrderEventTypes.Placed, entry.EventType);
        Assert.Equal(OutboxEntryDocument.IdFor("order-1", entry.SequenceNumber), entry.EventId);
        Assert.Equal(At(3).ToUnixTimeMilliseconds(), created.Document.PendingSince);
        var reread = await store.GetAsync("order-1", "customer-1");
        Assert.Single(reread!.Document.Outbox);
    }

    [Fact]
    public void TheEventIdIsTheSameForTheSameOrderAndSequenceAndDiffersOtherwise()
    {
        Assert.Equal(OutboxEntryDocument.IdFor("order-1", 1), OutboxEntryDocument.IdFor("order-1", 1));
        Assert.NotEqual(OutboxEntryDocument.IdFor("order-1", 1), OutboxEntryDocument.IdFor("order-1", 2));
        Assert.NotEqual(OutboxEntryDocument.IdFor("order-1", 1), OutboxEntryDocument.IdFor("order-2", 1));
        Assert.True(Guid.TryParse(OutboxEntryDocument.IdFor("order-1", 1), out _));
    }

    [Fact]
    public async Task PendingSinceIsInTheStoredJsonOnlyWhileSomethingIsPending()
    {
        var store = NewStore();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var pendingJson = JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(created.Document));

        var cleared = (await store.TryMarkPublishedAsync(created, created.Document.Outbox.Select(e => e.EventId).ToList()))!;
        var clearedJson = JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(cleared.Document));

        Assert.NotNull(pendingJson["pendingSince"]);
        Assert.NotNull(pendingJson["outbox"]);
        Assert.Null(clearedJson["pendingSince"]); // absent, not null: the property is what the sparse index keys on
        Assert.Null(clearedJson["outbox"]);
    }

    [Fact]
    public async Task EventsRaisedByLaterChangesJoinTheOnesStillPending()
    {
        var store = NewStore();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var next = created.Order;
        next.Confirm(At(4));

        var updated = (await store.TryUpdateAsync(created, next))!;

        Assert.Equal([OrderEventTypes.Placed, OrderEventTypes.Confirmed], updated.Document.Outbox.Select(e => e.EventType));
        Assert.Equal(At(3).ToUnixTimeMilliseconds(), updated.Document.PendingSince); // the oldest still pending
    }

    [Fact]
    public async Task MarkingPublishedWithAStaleDocumentIsRefusedAndRemovesNothing()
    {
        var store = NewStore();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var next = created.Order;
        next.Confirm(At(4));
        await store.TryUpdateAsync(created, next); // the order moved on; `created` is now stale

        var result = await store.TryMarkPublishedAsync(created, created.Document.Outbox.Select(e => e.EventId).ToList());

        Assert.Null(result);
        Assert.Equal(2, (await store.GetAsync("order-1", "customer-1"))!.Document.Outbox.Count);
    }

    [Fact]
    public async Task FindPendingLooksAcrossCustomersAndSkipsOrdersWithNothingPendingOrTooNew()
    {
        var store = NewStore();
        await store.TryCreateAsync(PlacedWithEvent("order-a", "customer-a"), "key-a", "fp");
        var b = (await store.TryCreateAsync(PlacedWithEvent("order-b", "customer-b"), "key-b", "fp"))!;
        await store.TryMarkPublishedAsync(b, b.Document.Outbox.Select(e => e.EventId).ToList());
        await store.TryCreateAsync(PlacedWithEvent("order-c", "customer-c"), "key-c", "fp");

        var found = await store.FindPendingAsync(At(3), 10);
        var tooEarly = await store.FindPendingAsync(At(2), 10);

        Assert.Equal(["order-a", "order-c"], found.Select(f => f.Order.Id).Order());
        Assert.Empty(tooEarly);
        Assert.Single(await store.FindPendingAsync(At(3), 1)); // the batch size is honoured
    }

    // ---- the publisher -----------------------------------------------------------------------------

    private static (OrderStore Store, RecordingEvents Events, OrderEventPublisher Publisher) NewPublisher()
    {
        var store = NewStore();
        var events = new RecordingEvents();
        return (store, events, new OrderEventPublisher(events, store, NullLogger<OrderEventPublisher>.Instance));
    }

    [Fact]
    public async Task PublishingSendsEachEventOnceInOrderWithItsStoredIdAndEmptiesTheOutbox()
    {
        var (store, events, publisher) = NewPublisher();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var order = created.Order;
        order.Confirm(At(4));
        var updated = (await store.TryUpdateAsync(created, order))!;

        var result = await publisher.PublishPendingAsync(updated);

        Assert.Equal(new PublishResult(2, false), result);
        Assert.Equal([OrderEventTypes.Placed, OrderEventTypes.Confirmed], events.Published.Select(p => p.EventType));
        Assert.Equal(updated.Document.Outbox.Select(e => Guid.Parse(e.EventId)), events.Published.Select(p => p.EventId));
        Assert.All(events.Published, p => Assert.Equal("order-1", p.AggregateId));
        var stored = (await store.GetAsync("order-1", "customer-1"))!;
        Assert.Empty(stored.Document.Outbox);
        Assert.Null(stored.Document.PendingSince);
        Assert.IsType<OrderPlacedPayload>(events.Published[0].Payload);
        Assert.IsType<OrderConfirmedPayload>(events.Published[1].Payload);
    }

    [Fact]
    public async Task APublishFailureLeavesThatEventAndLaterOnesPendingSoNothingOvertakesIt()
    {
        var (store, events, publisher) = NewPublisher();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var order = created.Order;
        order.Confirm(At(4));
        order.StartPreparation(At(5));
        var updated = (await store.TryUpdateAsync(created, order))!;
        events.FailOnlyType = OrderEventTypes.Confirmed;

        var result = await publisher.PublishPendingAsync(updated);

        Assert.Equal(new PublishResult(1, true), result);
        Assert.Equal([OrderEventTypes.Placed], events.Published.Select(p => p.EventType)); // PreparationStarted did not jump the queue
        var stored = (await store.GetAsync("order-1", "customer-1"))!;
        Assert.Equal([OrderEventTypes.Confirmed, OrderEventTypes.PreparationStarted], stored.Document.Outbox.Select(e => e.EventType));

        events.FailOnlyType = null;
        var retry = await publisher.PublishPendingAsync(stored);
        Assert.Equal(new PublishResult(2, false), retry);
        Assert.Equal(
            [OrderEventTypes.Placed, OrderEventTypes.Confirmed, OrderEventTypes.PreparationStarted], events.Published.Select(p => p.EventType));
        Assert.Equal(3, events.Published.Select(p => p.EventId).Distinct().Count());
    }

    [Fact]
    public async Task APublishRepeatedAfterALostCleanupCarriesTheSameEventIds()
    {
        var (store, events, publisher) = NewPublisher();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;

        await publisher.PublishPendingAsync(created);
        await publisher.PublishPendingAsync(created); // a second instance holding the same stale read: the crash-before-cleanup case

        Assert.Equal(2, events.Published.Count);
        Assert.Single(events.Published.Select(p => p.EventId).Distinct()); // consumers dedupe on this
        Assert.Empty((await store.GetAsync("order-1", "customer-1"))!.Document.Outbox);
    }

    [Fact]
    public async Task APublisherThatLosesTheCleanupRaceToAChangeToTheOrderStillCleansUp()
    {
        var (store, events, publisher) = NewPublisher();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        var order = created.Order;
        order.Confirm(At(4));
        await store.TryUpdateAsync(created, order); // the order changes while `created` is being published

        await publisher.PublishPendingAsync(created);

        var stored = (await store.GetAsync("order-1", "customer-1"))!;
        Assert.Equal([OrderEventTypes.Confirmed], stored.Document.Outbox.Select(e => e.EventType)); // Placed removed, the new event kept
        Assert.Single(events.Published);
    }

    [Fact]
    public async Task AnEventTypeThePublisherDoesNotKnowStaysPendingWithoutThrowing()
    {
        var (store, events, publisher) = NewPublisher();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        created.Document.Outbox[0].EventType = "order.from-the-future";

        var result = await publisher.PublishPendingAsync(created);

        Assert.Equal(new PublishResult(0, true), result);
        Assert.Empty(events.Published);
        Assert.Single((await store.GetAsync("order-1", "customer-1"))!.Document.Outbox);
    }

    [Fact]
    public async Task TheStoredTraceContextTravelsWithTheEvent()
    {
        var (store, events, publisher) = NewPublisher();
        using var activity = new Activity("checkout").SetIdFormat(ActivityIdFormat.W3C);
        activity.Start();
        var created = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        activity.Stop();

        await publisher.PublishPendingAsync(created);

        Assert.Equal(activity.Id, Assert.Single(events.Published).Traceparent);
    }

    [Fact]
    public async Task AnOrderTakenThroughItsWholeLifecycleEmitsFiveOrderedEventsAndOneCancelIsAlsoSent()
    {
        var (store, events, publisher) = NewPublisher();
        var stored = (await store.TryCreateAsync(PlacedWithEvent(), "key-1", "fp-1"))!;
        await publisher.PublishPendingAsync(stored);

        foreach (var step in new Action<Order>[]
                 {
                     o => o.Confirm(At(4)), o => o.StartPreparation(At(5)), o => o.MarkReady(At(6)), o => o.Complete(At(7)),
                 })
        {
            stored = (await store.GetAsync("order-1", "customer-1"))!;
            var order = stored.Order;
            step(order);
            stored = (await store.TryUpdateAsync(stored, order))!;
            await publisher.PublishPendingAsync(stored);
        }

        Assert.Equal(
            [OrderEventTypes.Placed, OrderEventTypes.Confirmed, OrderEventTypes.PreparationStarted, OrderEventTypes.ReadyForFulfillment, OrderEventTypes.Completed],
            events.Published.Select(p => p.EventType));
        Assert.Equal([1L, 2, 3, 4, 5], events.Published.Select(p => p.Sequence));
        Assert.Empty((await store.GetAsync("order-1", "customer-1"))!.Document.Outbox);

        var cancelled = (await store.TryCreateAsync(PlacedWithEvent("order-2"), "key-2", "fp-2"))!;
        var toCancel = cancelled.Order;
        toCancel.Cancel(OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, At(4));
        await publisher.PublishPendingAsync((await store.TryUpdateAsync(cancelled, toCancel))!);
        Assert.Equal(OrderEventTypes.Cancelled, events.Published[^1].EventType);
        Assert.IsType<OrderCancelledPayload>(events.Published[^1].Payload);
    }

    // ---- the relay ----------------------------------------------------------------------------------

    [Fact]
    public async Task TheRelayPublishesEventsTheInlinePathMissedOnceTheGracePeriodHasPassed()
    {
        var f = new CheckoutFixture();
        f.Events.Fail = true;
        var created = await f.CheckoutAsync();
        Assert.Equal(CheckoutOutcome.Created, created.Outcome);
        Assert.Empty(f.Events.Published);
        f.Events.Fail = false;

        var tooSoon = await f.Relay.SweepOnceAsync(default);
        f.Time.Now = f.Time.Now.AddSeconds(f.Outbox.GraceSeconds + 1);
        var later = await f.Relay.SweepOnceAsync(default);
        var again = await f.Relay.SweepOnceAsync(default);

        Assert.Equal((0, 0), tooSoon); // possibly still being published inline: left alone
        Assert.Equal((1, 1), later);
        Assert.Equal((0, 0), again); // nothing left
        Assert.Equal(OrderEventTypes.Placed, Assert.Single(f.Events.Published).EventType);
    }

    [Fact]
    public async Task ARelaySweepWhileTheBrokerIsStillDownPublishesNothingAndKeepsTheEventsForTheNextSweep()
    {
        var f = new CheckoutFixture();
        f.Events.Fail = true;
        await f.CheckoutAsync();
        f.Time.Now = f.Time.Now.AddSeconds(30);

        var down = await f.Relay.SweepOnceAsync(default);
        f.Events.Fail = false;
        var up = await f.Relay.SweepOnceAsync(default);

        Assert.Equal((1, 0), down);
        Assert.Equal((1, 1), up);
    }

    [Fact]
    public void TheDelayStaysAtTheBaseRateThenGrowsWhileIdleAndStopsAtTheMaximum()
    {
        var options = new OutboxOptions { SweepSeconds = 5, MaxIdleSeconds = 60 };
        double Seconds(int empty) => OutboxTiming.NextDelay(options, empty, 0.5).TotalSeconds; // jitter 0.5 = exactly the base

        Assert.Equal(5, Seconds(0), 3);
        Assert.Equal(5, Seconds(2), 3);
        Assert.Equal(10, Seconds(3), 3);
        Assert.Equal(20, Seconds(4), 3);
        Assert.Equal(60, Seconds(10), 3);
        Assert.Equal(60, Seconds(1000), 3);
    }

    [Fact]
    public void JitterVariesTheDelayByAboutTwentyPercentEitherWay()
    {
        var options = new OutboxOptions { SweepSeconds = 10, MaxIdleSeconds = 10 };

        Assert.Equal(8, OutboxTiming.NextDelay(options, 0, 0).TotalSeconds, 3);
        Assert.Equal(12, OutboxTiming.NextDelay(options, 0, 1).TotalSeconds, 3);
    }

    [Fact]
    public async Task ASignalWakesTheWaiterEarlyAndRepeatedSignalsDoNotPileUp()
    {
        var signal = new OutboxSignal();

        signal.Wake();
        signal.Wake();
        signal.Wake();

        Assert.True(await signal.WaitAsync(TimeSpan.FromSeconds(5), default)); // woken at once
        Assert.False(await signal.WaitAsync(TimeSpan.FromMilliseconds(50), default)); // only one wake-up was kept
    }

    [Fact]
    public async Task TheRunningRelayDeliversAMissedEventAfterBeingWoken()
    {
        var f = new CheckoutFixture();
        f.Outbox.SweepSeconds = 3600; // would never fire on its own during this test
        f.Outbox.MaxIdleSeconds = 3600;
        f.Outbox.GraceSeconds = 0;
        f.Events.Fail = true;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        await f.Relay.StartAsync(cts.Token);
        try
        {
            await f.CheckoutAsync(); // fails inline, which wakes the relay
            await Task.Delay(100);
            f.Events.Fail = false;
            f.Time.Now = f.Time.Now.AddSeconds(1);
            f.Signal.Wake();

            await WaitUntil(() => f.Events.Published.Count == 1, cts.Token);
        }
        finally
        {
            await f.Relay.StopAsync(CancellationToken.None);
        }
        Assert.Equal(OrderEventTypes.Placed, Assert.Single(f.Events.Published).EventType);
    }

    private static async Task WaitUntil(Func<bool> condition, CancellationToken ct)
    {
        while (!condition())
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(25, ct);
        }
    }

    // ---- checkout -----------------------------------------------------------------------------------

    [Fact]
    public async Task CheckoutPublishesOrderPlacedBeforeItReturnsAndLeavesNothingPending()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync();

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        var placed = Assert.Single(f.Events.Published);
        Assert.Equal(OrderEventTypes.Placed, placed.EventType);
        Assert.Equal(result.Order!.Order.Id, placed.AggregateId);
        var payload = Assert.IsType<OrderPlacedPayload>(placed.Payload);
        Assert.Equal(result.Order.Order.TotalCents, payload.TotalCents);
        Assert.Empty((await f.Store.GetAsync(result.Order.Order.Id, "customer-1"))!.Document.Outbox);
    }

    [Fact]
    public async Task ABrokerOutageDoesNotFailTheCheckoutAndTheEventWaitsInTheOutbox()
    {
        var f = new CheckoutFixture();
        f.Events.Fail = true;

        var result = await f.CheckoutAsync();

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        var stored = (await f.Store.GetAsync(result.Order!.Order.Id, "customer-1"))!;
        Assert.Equal(OrderEventTypes.Placed, Assert.Single(stored.Document.Outbox).EventType);
        Assert.True(await f.Signal.WaitAsync(TimeSpan.FromSeconds(1), default)); // the relay was told
    }

    [Fact]
    public async Task ASlowBrokerDelaysTheCheckoutNoLongerThanTheTimeoutAndTheEventStaysForTheRelay()
    {
        var f = new CheckoutFixture();
        f.Outbox.InlinePublishTimeoutSeconds = 1;
        var release = new TaskCompletionSource();
        f.Events.Hang = release.Task;

        var clock = Stopwatch.StartNew();
        var result = await f.CheckoutAsync();
        clock.Stop();
        release.SetResult();

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.InRange(clock.Elapsed, TimeSpan.FromMilliseconds(800), TimeSpan.FromSeconds(5));
        Assert.True(await f.Signal.WaitAsync(TimeSpan.FromSeconds(1), default));
    }

    [Fact]
    public async Task ARepeatedCheckoutDoesNotPublishTheEventAgain()
    {
        var f = new CheckoutFixture();
        var key = Seed.NewKey();

        await f.CheckoutAsync(key: key);
        var repeat = await f.CheckoutAsync(key: key);

        Assert.Equal(CheckoutOutcome.Existing, repeat.Outcome);
        Assert.Single(f.Events.Published);
    }

    [Fact]
    public async Task ADeclinedPaymentPublishesNothingBecauseNoOrderWasStored()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(decline: true);

        Assert.Equal(CheckoutOutcome.PaymentDeclined, result.Outcome);
        Assert.Empty(f.Events.Published);
    }
}
