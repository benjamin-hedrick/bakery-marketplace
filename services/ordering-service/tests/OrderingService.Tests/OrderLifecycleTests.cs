using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>WI-ORD-002: the lifecycle in docs/architecture/order-lifecycle.md.</summary>
public class OrderLifecycleTests
{
    private static readonly OrderStatus[] All = Enum.GetValues<OrderStatus>();

    private static readonly Dictionary<string, Action<Order>> Actions = new()
    {
        ["Place"] = o => o.Place(At(30)),
        ["Confirm"] = o => o.Confirm(At(30)),
        ["StartPreparation"] = o => o.StartPreparation(At(30)),
        ["MarkReady"] = o => o.MarkReady(At(30)),
        ["Complete"] = o => o.Complete(At(30)),
    };

    // Action -> (the only status it may start from, the status it ends in)
    private static readonly Dictionary<string, (OrderStatus From, OrderStatus To)> Edges = new()
    {
        ["Place"] = (OrderStatus.Pending, OrderStatus.Placed),
        ["Confirm"] = (OrderStatus.Placed, OrderStatus.Confirmed),
        ["StartPreparation"] = (OrderStatus.Confirmed, OrderStatus.InPreparation),
        ["MarkReady"] = (OrderStatus.InPreparation, OrderStatus.ReadyForFulfillment),
        ["Complete"] = (OrderStatus.ReadyForFulfillment, OrderStatus.Completed),
    };

    public static IEnumerable<object[]> Matrix() =>
        from action in Actions.Keys from status in All select new object[] { action, status };

    [Theory]
    [MemberData(nameof(Matrix))]
    public void EveryActionIsValidFromExactlyOneStatus_AndThrowsFromAllOthers(string action, OrderStatus start)
    {
        var order = In(start);
        var (from, to) = Edges[action];

        if (start == from)
        {
            Actions[action](order);
            Assert.Equal(to, order.Status);
        }
        else
        {
            var ex = Assert.Throws<InvalidOrderTransitionException>(() => Actions[action](order));
            Assert.Equal(start, order.Status);
            Assert.Contains(start.ToString(), ex.Message);
        }
    }

    [Fact]
    public void TheHappyPathWalksPendingToCompleted()
    {
        var order = Pending();
        Assert.Equal(OrderStatus.Pending, order.Status);

        order.Place(At(3));
        order.Confirm(At(4));
        order.StartPreparation(At(5));
        order.MarkReady(At(6));
        order.Complete(At(7));

        Assert.Equal(OrderStatus.Completed, order.Status);
        Assert.Equal(At(7), order.UpdatedAt);
        Assert.Equal(T0, order.CreatedAt);
    }

    [Fact]
    public void RepeatingATransitionThrows()
    {
        var order = In(OrderStatus.Confirmed);
        Assert.Throws<InvalidOrderTransitionException>(() => order.Confirm(At(9)));
    }

    [Fact]
    public void FailedTransitionsChangeNothing()
    {
        var order = In(OrderStatus.Placed);
        var sequence = order.SequenceNumber;
        var updated = order.UpdatedAt;

        Assert.Throws<InvalidOrderTransitionException>(() => order.Complete(At(50)));

        Assert.Equal(OrderStatus.Placed, order.Status);
        Assert.Equal(sequence, order.SequenceNumber);
        Assert.Equal(updated, order.UpdatedAt);
        Assert.Empty(order.DequeueEvents());
    }

    [Fact]
    public void CompletedAndCancelledAreFinal()
    {
        foreach (var final in new[] { OrderStatus.Completed, OrderStatus.Cancelled })
        {
            var order = In(final);
            Assert.All(Actions.Values, act => Assert.Throws<InvalidOrderTransitionException>(() => act(order)));
            Assert.Throws<InvalidOrderTransitionException>(
                () => order.Cancel(OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled, At(40)));
        }
    }
}
