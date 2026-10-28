using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;

namespace OrderingService.Tests;

/// <summary>Builders shared by the aggregate tests. Time is always passed in, never read from the wall clock.</summary>
internal static class OrderTestSupport
{
    public static readonly DateTimeOffset T0 = new(2026, 11, 2, 8, 0, 0, TimeSpan.Zero);

    public static DateTimeOffset At(int minutes) => T0.AddMinutes(minutes);

    public static OrderLine Line(string listing = "listing-sourdough-001", int quantity = 2, int unitCents = 900, params string[] modifiers) =>
        new(listing, modifiers, quantity, unitCents);

    public static Order Pending(bool withWindow = true)
    {
        var order = Order.Create("order-1", "customer-1", "vendor-1", FulfillmentType.Pickup, T0);
        order.AddLine(Line(modifiers: ["mod-seeds"]), At(1));
        if (withWindow)
        {
            order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(At(60), At(75), "Front counter"), At(2));
        }
        return order;
    }

    public static Order Placed(bool withWindow = true)
    {
        var order = Pending(withWindow);
        order.Place(At(3));
        order.DequeueEvents();
        return order;
    }

    /// <summary>Moves a fresh order to <paramref name="status"/> through the real transitions.</summary>
    public static Order In(OrderStatus status)
    {
        var order = Pending();
        if (status == OrderStatus.Pending) return order;
        order.Place(At(3));
        if (status == OrderStatus.Placed) return Done(order);
        order.Confirm(At(4));
        if (status == OrderStatus.Confirmed) return Done(order);
        order.StartPreparation(At(5));
        if (status == OrderStatus.InPreparation) return Done(order);
        order.MarkReady(At(6));
        if (status == OrderStatus.ReadyForFulfillment) return Done(order);
        if (status == OrderStatus.Completed)
        {
            order.Complete(At(7));
            return Done(order);
        }
        order = In(OrderStatus.Placed);
        order.Cancel(OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, At(8));
        return Done(order);
    }

    private static Order Done(Order order)
    {
        order.DequeueEvents();
        return order;
    }
}
