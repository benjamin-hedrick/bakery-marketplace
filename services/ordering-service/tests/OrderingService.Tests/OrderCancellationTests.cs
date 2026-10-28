using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>The cancel table in docs/architecture/order-lifecycle.md.</summary>
public class OrderCancellationTests
{
    private static readonly OrderStatus[] AllStatuses = Enum.GetValues<OrderStatus>();
    private static readonly OrderCancelActor[] Actors = Enum.GetValues<OrderCancelActor>();
    private static readonly OrderCancelReason[] Reasons = Enum.GetValues<OrderCancelReason>();

    // The complete set of allowed (status, actor, reason) combinations.
    private static readonly HashSet<(OrderStatus, OrderCancelActor, OrderCancelReason)> Allowed =
    [
        (OrderStatus.Placed, OrderCancelActor.Customer, OrderCancelReason.CustomerRequested),
        (OrderStatus.Placed, OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined),
        (OrderStatus.Confirmed, OrderCancelActor.Customer, OrderCancelReason.CustomerRequested),
        (OrderStatus.Confirmed, OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled),
        (OrderStatus.InPreparation, OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled),
        (OrderStatus.ReadyForFulfillment, OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled),
    ];

    public static IEnumerable<object[]> Combinations() =>
        from s in AllStatuses from a in Actors from r in Reasons select new object[] { s, a, r };

    [Theory]
    [MemberData(nameof(Combinations))]
    public void CancelIsAllowedOnlyForTheDocumentedCombinations(OrderStatus status, OrderCancelActor actor, OrderCancelReason reason)
    {
        var order = In(status);

        if (Allowed.Contains((status, actor, reason)))
        {
            order.Cancel(actor, reason, At(20));

            Assert.Equal(OrderStatus.Cancelled, order.Status);
            Assert.Equal(actor, order.CancelledBy);
            Assert.Equal(reason, order.CancelReason);
            Assert.Equal(At(20), order.UpdatedAt);
        }
        else
        {
            Assert.Throws<InvalidOrderTransitionException>(() => order.Cancel(actor, reason, At(20)));
            Assert.Equal(status, order.Status);
            // A rejected cancel records nothing new (an order that starts Cancelled keeps its original actor).
            Assert.Equal(status == OrderStatus.Cancelled ? OrderCancelActor.Customer : null, order.CancelledBy);
        }
    }

    [Fact]
    public void ACustomerCannotCancelOnceTheVendorHasStartedPreparing()
    {
        var order = In(OrderStatus.InPreparation);
        Assert.Throws<InvalidOrderTransitionException>(
            () => order.Cancel(OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, At(20)));
    }

    [Fact]
    public void APendingOrderIsAbandonedNotCancelled()
    {
        var order = In(OrderStatus.Pending);
        Assert.Throws<InvalidOrderTransitionException>(
            () => order.Cancel(OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, At(20)));
    }

    [Fact]
    public void CancellationRaisesOneEventWithTheActorAndReasonCode()
    {
        var order = In(OrderStatus.Confirmed);
        var before = order.SequenceNumber;

        order.Cancel(OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled, At(20));

        var cancelled = Assert.Single(order.DequeueEvents());
        Assert.Equal(OrderEventTypes.Cancelled, cancelled.EventType);
        Assert.Equal(before + 1, cancelled.SequenceNumber);
        Assert.Equal(At(20), cancelled.OccurredAt);
        Assert.Equal(
            new OrderCancelledPayload("order-1", OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled),
            cancelled.Payload);
    }
}
