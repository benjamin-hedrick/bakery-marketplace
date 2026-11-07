using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using OrderingService.Orders;

namespace OrderingService.Tests;

/// <summary>WI-ORD-007: the order actions, against scripted collaborators (the HTTP and authorization layer is in OrderActionApiTests).</summary>
public class OrderActionTests
{
    private static readonly OrderCaller TheVendor = new(Seed.Vendor, IsVendor: true, IsCustomer: false);
    private static readonly OrderCaller OtherVendor = new("vendor-other", IsVendor: true, IsCustomer: false);
    private static readonly OrderCaller TheCustomer = new("customer-1", IsVendor: false, IsCustomer: true);
    private static readonly OrderCaller OtherCustomer = new("customer-2", IsVendor: false, IsCustomer: true);

    private static async Task<string> PlaceAsync(CheckoutFixture f)
    {
        var placed = await f.CheckoutAsync();
        Assert.Equal(OrderingService.Checkout.CheckoutOutcome.Created, placed.Outcome);
        return placed.Order!.Order.Id;
    }

    private static async Task<string> InStatusAsync(CheckoutFixture f, OrderStatus status)
    {
        var id = await PlaceAsync(f);
        var steps = new[] { OrderAction.Confirm, OrderAction.StartPreparation, OrderAction.MarkReady, OrderAction.Complete };
        var needed = status switch
        {
            OrderStatus.Placed => 0,
            OrderStatus.Confirmed => 1,
            OrderStatus.InPreparation => 2,
            OrderStatus.ReadyForFulfillment => 3,
            _ => 4,
        };
        foreach (var step in steps.Take(needed))
        {
            if (step == OrderAction.Complete)
            {
                // Handed over: ordering publishes a request, the pickup strategy answers, ordering completes (WI-ORD-003).
                Assert.Equal(OrderActionOutcome.Accepted, (await f.Actions.ActAsync(id, TheVendor, step)).Outcome);
                await f.DeliverFulfillmentEventsAsync();
            }
            else Assert.Equal(OrderActionOutcome.Done, (await f.Actions.ActAsync(id, TheVendor, step)).Outcome);
        }
        return id;
    }

    private static async Task<Order> StoredAsync(CheckoutFixture f, string id) => (await f.Store.GetAsync(id, "customer-1"))!.Order;

    // ---- the vendor's path -------------------------------------------------------------------------

    [Fact]
    public async Task AVendorTakesTheirOrderFromPlacedToCompletedAndEachStepIsPublishedOnceInOrder()
    {
        var f = new CheckoutFixture();

        var id = await InStatusAsync(f, OrderStatus.Completed);

        Assert.Equal(OrderStatus.Completed, (await StoredAsync(f, id)).Status);
        var orderEvents = f.Events.Published.Where(p => p.AggregateId == id && p.EventType.StartsWith("Order") && !p.EventType.StartsWith("OrderFulfillment")).ToList();
        Assert.Equal(
            [OrderEventTypes.Placed, OrderEventTypes.Confirmed, OrderEventTypes.PreparationStarted, OrderEventTypes.ReadyForFulfillment, OrderEventTypes.Completed],
            orderEvents.Select(p => p.EventType));
        Assert.Equal([1L, 2, 3, 4, 5], orderEvents.Select(p => p.Sequence));
        // The completion went through the seam: a request, then the strategy's answer, and only then the order's own event.
        Assert.Equal(
            [FulfillmentEventTypes.ConfirmationRequested, FulfillmentEventTypes.Completed],
            f.Events.Published.Where(p => p.EventType.StartsWith("OrderFulfillment")).Select(p => p.EventType));
        Assert.Empty((await f.Store.GetAsync(id, "customer-1"))!.Document.Outbox);
        Assert.Empty(f.Catalog.ReleaseCalls); // moving forward never releases stock
    }

    [Fact]
    public async Task TheResultCarriesTheUpdatedOrder()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome);
        Assert.Equal(OrderStatus.Confirmed, result.Order!.Order.Status);
    }

    // ---- ownership: anything that is not the caller's own order is "not found" ---------------------

    public static IEnumerable<object[]> EveryAction() => Enum.GetValues<OrderAction>().Select(a => new object[] { a });

    [Theory]
    [MemberData(nameof(EveryAction))]
    public async Task AnotherVendorCannotActOnTheOrderAndNothingChanges(OrderAction action)
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        var before = f.Events.Published.Count;

        var result = await f.Actions.ActAsync(id, OtherVendor, action);

        Assert.Equal(OrderActionOutcome.NotFound, result.Outcome);
        Assert.Equal(OrderStatus.Placed, (await StoredAsync(f, id)).Status);
        Assert.Equal(before, f.Events.Published.Count);
        Assert.Empty(f.Catalog.ReleaseCalls);
    }

    [Theory]
    [InlineData(OrderAction.Confirm)]
    [InlineData(OrderAction.Decline)]
    [InlineData(OrderAction.StartPreparation)]
    [InlineData(OrderAction.MarkReady)]
    [InlineData(OrderAction.Complete)]
    public async Task ACustomerCannotDoAVendorAction(OrderAction action)
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);

        var result = await f.Actions.ActAsync(id, TheCustomer, action);

        Assert.Equal(OrderActionOutcome.NotFound, result.Outcome);
        Assert.Equal(OrderStatus.Placed, (await StoredAsync(f, id)).Status);
    }

    [Theory]
    [InlineData(OrderAction.Confirm)]
    [InlineData(OrderAction.Decline)]
    [InlineData(OrderAction.Cancel)]
    public async Task OwningTheVendorIdIsNotEnoughWithoutTheVendorRole(OrderAction action)
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        var wrongRole = new OrderCaller(Seed.Vendor, IsVendor: false, IsCustomer: action == OrderAction.Cancel);

        var result = await f.Actions.ActAsync(id, wrongRole, action);

        Assert.Equal(OrderActionOutcome.NotFound, result.Outcome); // the role is checked here as well as by the endpoint policy
        Assert.Equal(OrderStatus.Placed, (await StoredAsync(f, id)).Status);
    }

    [Fact]
    public async Task AnotherCustomerCannotCancelSomeoneElsesOrder()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);

        var result = await f.Actions.ActAsync(id, OtherCustomer, OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.NotFound, result.Outcome);
        Assert.Equal(OrderStatus.Placed, (await StoredAsync(f, id)).Status);
        Assert.Empty(f.Catalog.ReleaseCalls);
    }

    [Fact]
    public async Task AnOrderThatDoesNotExistIsNotFoundForEveryone()
    {
        var f = new CheckoutFixture();

        Assert.Equal(OrderActionOutcome.NotFound, (await f.Actions.ActAsync("order-missing", TheVendor, OrderAction.Confirm)).Outcome);
        Assert.Equal(OrderActionOutcome.NotFound, (await f.Actions.ActAsync("order-missing", TheCustomer, OrderAction.Cancel)).Outcome);
    }

    // ---- cancellation: actor and reason come from who is acting, and stock is released --------------

    [Theory]
    [InlineData(OrderStatus.Placed)]
    [InlineData(OrderStatus.Confirmed)]
    public async Task ACustomerCancelsWhilePlacedOrConfirmedAndTheStockIsReleased(OrderStatus status)
    {
        var f = new CheckoutFixture();
        var id = await InStatusAsync(f, status);

        var result = await f.Actions.ActAsync(id, TheCustomer, OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome);
        var order = await StoredAsync(f, id);
        Assert.Equal(OrderStatus.Cancelled, order.Status);
        Assert.Equal(OrderCancelActor.Customer, order.CancelledBy);
        Assert.Equal(OrderCancelReason.CustomerRequested, order.CancelReason);
        Assert.Equal(id, Assert.Single(f.Catalog.ReleaseCalls));
        var cancelled = Assert.IsType<OrderCancelledPayload>(f.Events.Published[^1].Payload);
        Assert.Equal(OrderCancelActor.Customer, cancelled.CancelledBy);
    }

    [Theory]
    [InlineData(OrderStatus.InPreparation)]
    [InlineData(OrderStatus.ReadyForFulfillment)]
    [InlineData(OrderStatus.Completed)]
    public async Task ACustomerCannotCancelOnceTheVendorHasStartedAndNothingIsReleased(OrderStatus status)
    {
        var f = new CheckoutFixture();
        var id = await InStatusAsync(f, status);

        var result = await f.Actions.ActAsync(id, TheCustomer, OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.Conflict, result.Outcome);
        Assert.Equal(status, result.CurrentStatus);
        Assert.Equal(status, (await StoredAsync(f, id)).Status);
        Assert.Empty(f.Catalog.ReleaseCalls);
    }

    [Theory]
    [InlineData(OrderStatus.Placed, OrderCancelReason.VendorDeclined)]
    [InlineData(OrderStatus.Confirmed, OrderCancelReason.VendorCancelled)]
    [InlineData(OrderStatus.InPreparation, OrderCancelReason.VendorCancelled)]
    [InlineData(OrderStatus.ReadyForFulfillment, OrderCancelReason.VendorCancelled)]
    public async Task AVendorCancelIsADeclineBeforeAcceptanceAndACancellationAfterAndReleasesTheStock(OrderStatus status, OrderCancelReason reason)
    {
        var f = new CheckoutFixture();
        var id = await InStatusAsync(f, status);

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome);
        var order = await StoredAsync(f, id);
        Assert.Equal(OrderCancelActor.Vendor, order.CancelledBy);
        Assert.Equal(reason, order.CancelReason);
        Assert.Equal(id, Assert.Single(f.Catalog.ReleaseCalls));
    }

    [Fact]
    public async Task ADeclineIsOnlyForAPlacedOrder()
    {
        var f = new CheckoutFixture();
        var placed = await InStatusAsync(f, OrderStatus.Placed);
        var confirmed = await InStatusAsync(f, OrderStatus.Confirmed);

        var declined = await f.Actions.ActAsync(placed, TheVendor, OrderAction.Decline);
        var tooLate = await f.Actions.ActAsync(confirmed, TheVendor, OrderAction.Decline);

        Assert.Equal(OrderActionOutcome.Done, declined.Outcome);
        Assert.Equal(OrderCancelReason.VendorDeclined, declined.Order!.Order.CancelReason);
        Assert.Equal(OrderActionOutcome.Conflict, tooLate.Outcome);
        Assert.Equal(OrderStatus.Confirmed, tooLate.CurrentStatus);
        Assert.Equal(placed, Assert.Single(f.Catalog.ReleaseCalls));
    }

    [Fact]
    public async Task AFailedStockReleaseDoesNotUndoTheCancellation()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        f.Catalog.ReleaseFails = true;

        var result = await f.Actions.ActAsync(id, TheCustomer, OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome); // the order is cancelled; the leftover reservation is open item 62
        Assert.Equal(OrderStatus.Cancelled, (await StoredAsync(f, id)).Status);
        Assert.Equal(OrderEventTypes.Cancelled, f.Events.Published[^1].EventType);
    }

    // ---- refused transitions ------------------------------------------------------------------------

    [Fact]
    public async Task RepeatingAnActionIsAConflictThatNamesTheCurrentStatusAndPublishesNothingNew()
    {
        var f = new CheckoutFixture();
        var id = await InStatusAsync(f, OrderStatus.Confirmed);
        var before = f.Events.Published.Count;

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm);

        Assert.Equal(OrderActionOutcome.Conflict, result.Outcome);
        Assert.Equal("invalid_transition", result.Code);
        Assert.Equal(OrderStatus.Confirmed, result.CurrentStatus);
        Assert.Equal(before, f.Events.Published.Count);
        Assert.Equal(2, (await StoredAsync(f, id)).SequenceNumber); // Placed, Confirmed: the repeat added nothing
    }

    [Theory]
    [InlineData(OrderStatus.Placed, OrderAction.StartPreparation)]
    [InlineData(OrderStatus.Placed, OrderAction.MarkReady)]
    [InlineData(OrderStatus.Placed, OrderAction.Complete)]
    [InlineData(OrderStatus.Confirmed, OrderAction.MarkReady)]
    [InlineData(OrderStatus.Confirmed, OrderAction.Complete)]
    [InlineData(OrderStatus.InPreparation, OrderAction.Confirm)]
    [InlineData(OrderStatus.InPreparation, OrderAction.Complete)]
    [InlineData(OrderStatus.ReadyForFulfillment, OrderAction.StartPreparation)]
    [InlineData(OrderStatus.Completed, OrderAction.Confirm)]
    [InlineData(OrderStatus.Completed, OrderAction.Cancel)]
    public async Task AnActionThatSkipsOrRepeatsAStepIsRefusedAndTheStoredOrderIsUnchanged(OrderStatus status, OrderAction action)
    {
        var f = new CheckoutFixture();
        var id = await InStatusAsync(f, status);
        var before = await StoredAsync(f, id);

        var result = await f.Actions.ActAsync(id, TheVendor, action);

        Assert.Equal(OrderActionOutcome.Conflict, result.Outcome);
        Assert.Equal(status, result.CurrentStatus);
        var after = await StoredAsync(f, id);
        Assert.Equal(before.SequenceNumber, after.SequenceNumber);
        Assert.Equal(before.UpdatedAt, after.UpdatedAt);
        Assert.Empty(f.Catalog.ReleaseCalls);
    }

    // ---- concurrency and failure --------------------------------------------------------------------

    [Fact]
    public async Task TwoVendorActionsRacingOnOneOrderLetExactlyOneWinAndTheOtherSeesTheNewStatus()
    {
        for (var round = 0; round < 20; round++)
        {
            var f = new CheckoutFixture();
            var id = await PlaceAsync(f);

            var results = await Task.WhenAll(
                f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm),
                f.Actions.ActAsync(id, TheVendor, OrderAction.Decline));

            Assert.Single(results, r => r.Outcome == OrderActionOutcome.Done);
            var loser = Assert.Single(results, r => r.Outcome == OrderActionOutcome.Conflict);
            var final = await StoredAsync(f, id);
            Assert.Equal(loser.CurrentStatus, final.Status); // the loser was told the state the winner left
            Assert.Equal(2, f.Events.Published.Count); // Placed plus exactly one of Confirmed or Cancelled
            Assert.Equal(final.Status == OrderStatus.Cancelled ? 1 : 0, f.Catalog.ReleaseCalls.Count); // stock is released only by the decline
        }
    }

    [Fact]
    public async Task ARepeatedConflictEndsInConcurrentUpdateInsteadOfLoopingForever()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        f.Repository.ConflictAlways = true;

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm);

        Assert.Equal(OrderActionOutcome.Conflict, result.Outcome);
        Assert.Equal("concurrent_update", result.Code);
    }

    [Fact]
    public async Task ASingleLostRaceIsRetriedTransparently()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        f.Repository.ConflictOnNextCreate = true; // the next conditional save reports a conflict once

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome);
        Assert.Equal(OrderStatus.Confirmed, (await StoredAsync(f, id)).Status);
    }

    [Fact]
    public async Task ABrokerOutageDoesNotFailTheActionAndTheRelayDeliversTheEventLater()
    {
        var f = new CheckoutFixture();
        var id = await PlaceAsync(f);
        f.Events.Fail = true;

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Confirm);
        f.Events.Fail = false;
        f.Time.Now = f.Time.Now.AddSeconds(f.Outbox.GraceSeconds + 1);
        await f.Relay.SweepOnceAsync(default);

        Assert.Equal(OrderActionOutcome.Done, result.Outcome);
        Assert.Equal(OrderEventTypes.Confirmed, f.Events.Published[^1].EventType);
        Assert.True(await f.Signal.WaitAsync(TimeSpan.FromSeconds(1), default)); // the relay was woken by the miss
    }
}
