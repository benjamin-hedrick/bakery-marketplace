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
    public void ConfirmRaisesOnlyOrderConfirmed_CarryingTheFulfillmentDetailsForTheStrategy()
    {
        var order = Placed();

        order.Confirm(At(4));

        var confirmed = Assert.Single(order.DequeueEvents());
        Assert.Equal(OrderEventTypes.Confirmed, confirmed.EventType);
        Assert.Equal(2, confirmed.SequenceNumber);
        var payload = Assert.IsType<OrderConfirmedPayload>(confirmed.Payload);
        Assert.Equal("order-1", payload.OrderId);
        Assert.Equal(FulfillmentType.Pickup, payload.FulfillmentType);
        Assert.Equal(At(60), payload.Details?.Pickup?.WindowStart);
        Assert.Equal(At(75), payload.Details?.Pickup?.WindowEnd);
        Assert.False(payload.Automatic); // a vendor's acceptance
    }

    [Fact]
    public void AnAutomaticConfirmationSaysSoInItsEvent()
    {
        var order = Placed();

        order.Confirm(At(4), automatic: true);

        Assert.True(Assert.IsType<OrderConfirmedPayload>(Assert.Single(order.DequeueEvents()).Payload).Automatic);
    }

    [Fact]
    public void TheOrderNeverRaisesStrategySpecificEvents()
    {
        var order = Pending();
        order.Place(At(3));
        order.Confirm(At(4));
        order.StartPreparation(At(5));
        order.MarkReady(At(6));
        order.Complete(At(7));

        var types = order.DequeueEvents().Select(e => e.EventType).ToArray();

        Assert.DoesNotContain("PickupWindowScheduled", types);
        Assert.DoesNotContain("OrderReadyForPickup", types);
    }

    [Fact]
    public void MarkReadyRaisesTheFulfillmentSeamEventWithTypeAndDetails()
    {
        var order = In(OrderStatus.InPreparation);

        order.MarkReady(At(6));

        var ready = Assert.Single(order.DequeueEvents());
        Assert.Equal(OrderEventTypes.ReadyForFulfillment, ready.EventType);
        var payload = Assert.IsType<OrderReadyForFulfillmentPayload>(ready.Payload);
        Assert.Equal(("order-1", "vendor-1", FulfillmentType.Pickup), (payload.OrderId, payload.VendorId, payload.FulfillmentType));
        Assert.Equal(At(60), payload.Details.Pickup?.WindowStart);
    }

    [Fact]
    public void AnOrderWithoutAWindowStillHandsTheStrategyItsFulfillmentType()
    {
        var order = Placed(withWindow: false);
        order.Confirm(At(4));
        order.StartPreparation(At(5));
        order.MarkReady(At(6));

        var events = order.DequeueEvents();

        var confirmed = Assert.IsType<OrderConfirmedPayload>(events[0].Payload);
        Assert.Null(confirmed.Details);
        var ready = Assert.IsType<OrderReadyForFulfillmentPayload>(events[2].Payload);
        Assert.Equal(FulfillmentType.Pickup, ready.Details.Type);
        Assert.Null(ready.Details.Pickup);
    }

    [Fact]
    public void TheFullPathRaisesTheOrdersEventsInOrderWithNoGaps()
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
                OrderEventTypes.Placed, OrderEventTypes.Confirmed, OrderEventTypes.PreparationStarted,
                OrderEventTypes.ReadyForFulfillment, OrderEventTypes.Completed,
            ],
            events.Select(e => e.EventType));
        Assert.Equal(Enumerable.Range(1, 5).Select(i => (long)i), events.Select(e => e.SequenceNumber));
        Assert.Equal(5, order.SequenceNumber);
        Assert.Equal(new OrderPreparationStartedPayload("order-1"), events[2].Payload);
        Assert.Equal(new OrderCompletedPayload("order-1", At(7)), events[4].Payload);
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
