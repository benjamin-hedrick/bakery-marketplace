using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>Events are raised as data (ORD-005 publishes them); sequence numbers count events (ADR-0003).</summary>
public class OrderEventTests
{
    [Fact]
    public void APendingOrderRaisesNothingAndHasSequenceZero()
    {
        var order = Pending();

        Assert.Equal(0, order.SequenceNumber);
        Assert.Empty(order.DequeueEvents());
    }

    [Fact]
    public void PlaceRaisesOrderPlacedWithTheLinesButNoPrices()
    {
        var order = Pending();

        order.Place(At(3));

        var placed = Assert.Single(order.DequeueEvents());
        Assert.Equal(OrderEventTypes.Placed, placed.EventType);
        Assert.Equal(1, placed.SequenceNumber);
        Assert.Equal(At(3), placed.OccurredAt);
        var payload = Assert.IsType<OrderPlacedPayload>(placed.Payload);
        Assert.Equal(("order-1", "customer-1", "vendor-1"), (payload.OrderId, payload.CustomerId, payload.VendorId));
        var line = Assert.Single(payload.LineItems);
        Assert.Equal(("listing-sourdough-001", 2), (line.ListingId, line.Quantity));
        Assert.Equal(new[] { "mod-seeds" }, line.ModifierIds);
    }

    [Fact]
    public void OrderPlacedCarriesTheTotalInCents()
    {
        var order = Pending(); // one line: 2 x 900

        order.Place(At(3));

        var payload = Assert.IsType<OrderPlacedPayload>(Assert.Single(order.DequeueEvents()).Payload);
        Assert.Equal(1800L, payload.TotalCents);
        Assert.Equal("USD", payload.Currency);
    }

    [Fact]
    public void ConfirmRaisesConfirmedThenTheScheduledWindow_WithConsecutiveSequenceNumbers()
    {
        var order = Placed();

        order.Confirm(At(4));

        var events = order.DequeueEvents();
        Assert.Equal([OrderEventTypes.Confirmed, OrderEventTypes.PickupWindowScheduled], events.Select(e => e.EventType));
        Assert.Equal([2L, 3L], events.Select(e => e.SequenceNumber));
        Assert.Equal(new OrderConfirmedPayload("order-1"), events[0].Payload);
        Assert.Equal(new PickupWindowScheduledPayload("order-1", At(60), At(75)), events[1].Payload);
    }

    [Fact]
    public void ConfirmWithoutARequestedWindowRaisesOnlyConfirmed()
    {
        var order = Placed(withWindow: false);

        order.Confirm(At(4));

        var confirmed = Assert.Single(order.DequeueEvents());
        Assert.Equal(OrderEventTypes.Confirmed, confirmed.EventType);
        Assert.Equal(2, confirmed.SequenceNumber);
    }

    [Fact]
    public void TheFullPathRaisesTheDocumentedEventsInOrderWithNoGaps()
    {
        var order = Pending();
        order.Place(At(3));
        order.Confirm(At(4));
        order.StartPreparation(At(5));
        order.MarkReady(At(6));
        order.Complete(At(7));

        var events = order.DequeueEvents();

        Assert.Equal(
            [
                OrderEventTypes.Placed, OrderEventTypes.Confirmed, OrderEventTypes.PickupWindowScheduled,
                OrderEventTypes.PreparationStarted, OrderEventTypes.ReadyForPickup, OrderEventTypes.Completed,
            ],
            events.Select(e => e.EventType));
        Assert.Equal(Enumerable.Range(1, 6).Select(i => (long)i), events.Select(e => e.SequenceNumber));
        Assert.Equal(6, order.SequenceNumber);
        Assert.Equal(new OrderPreparationStartedPayload("order-1"), events[3].Payload);
        Assert.Equal(new OrderReadyForPickupPayload("order-1"), events[4].Payload);
        Assert.Equal(new OrderCompletedPayload("order-1", At(7)), events[5].Payload);
    }

    [Fact]
    public void DequeueEventsReturnsEachEventOnce()
    {
        var order = Pending();
        order.Place(At(3));

        Assert.Single(order.DequeueEvents());
        Assert.Empty(order.DequeueEvents());
    }

    [Fact]
    public void EventTimesComeFromTheCallerNotTheWallClock()
    {
        var order = Pending();

        order.Place(At(-5000));

        Assert.Equal(At(-5000), Assert.Single(order.DequeueEvents()).OccurredAt);
    }
}
