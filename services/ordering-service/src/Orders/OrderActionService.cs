using BakeryMarketplace.EventSchemas;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Outbox;
using OrderingService.Persistence;

namespace OrderingService.Orders;

public enum OrderAction
{
    Confirm,
    Decline,
    StartPreparation,
    MarkReady,
    Complete,
    Cancel,
}

/// <summary>Who is acting, from the validated token: the subject and which of the two order roles it carries.</summary>
public sealed record OrderCaller(string Subject, bool IsVendor, bool IsCustomer);

public enum OrderActionOutcome
{
    Done,

    /// <summary>No such order for this caller: it does not exist or is someone else's (the two look the same).</summary>
    NotFound,

    /// <summary>The order's current status does not allow this action (or the action raced with another and lost).</summary>
    Conflict,
}

public sealed record OrderActionResult(OrderActionOutcome Outcome, StoredOrder? Order = null, string? Code = null, string? Message = null, OrderStatus? CurrentStatus = null);

/// <summary>
/// Moves an order through its lifecycle on behalf of its vendor or customer (WI-ORD-007, <c>docs/architecture/order-lifecycle.md</c>).
/// The caller must own the order (a vendor their own, a customer their own; anyone else gets "not found"). The aggregate decides whether the
/// transition is allowed; the order and its event are stored in one write; a cancellation then releases the held stock (ADR-0017); the event
/// is published straight away or left to the relay (ORD-005).
/// </summary>
public sealed partial class OrderActionService(
    OrderStore orders,
    ICatalogGateway catalog,
    OrderEventPublisher eventPublisher,
    TimeProvider time,
    ILogger<OrderActionService> logger)
{
    private const int MaxAttempts = 3;

    public async Task<OrderActionResult> ActAsync(string orderId, OrderCaller caller, OrderAction action, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var (stored, asVendor) = await LoadAsync(orderId, caller, action, ct);
            if (stored is null) return new OrderActionResult(OrderActionOutcome.NotFound, Code: "not_found", Message: "Order not found.");

            var now = time.GetUtcNow();
            var order = stored.Order;
            try
            {
                Apply(order, action, asVendor, now);
            }
            catch (InvalidOrderTransitionException e)
            {
                LogOrderRefusedInStatus(logger, orderId, action, order.Status);
                return new OrderActionResult(
                    OrderActionOutcome.Conflict, Code: "invalid_transition", Message: e.Message, CurrentStatus: order.Status);
            }

            var saved = await orders.TryUpdateAsync(stored, order, ct);
            if (saved is null) continue; // someone changed the order between our read and write: read it again and decide again

            if (action is OrderAction.Decline or OrderAction.Cancel) await ReleaseQuietlyAsync(saved.Order);
            await eventPublisher.PublishInlineAsync(saved);
            LogOrderDoneNow(logger, orderId, action, saved.Order.Status);
            return new OrderActionResult(OrderActionOutcome.Done, saved);
        }

        return new OrderActionResult(OrderActionOutcome.Conflict, Code: "concurrent_update", Message: "The order was changed by someone else. Please try again.");
    }

    /// <summary>
    /// Finds the order the caller owns and says in which capacity. Who is acting is decided by which side of the order the caller owns, never
    /// by anything in the request. Only a cancel can come from the customer; every other action is the vendor's.
    /// </summary>
    private async Task<(StoredOrder? Order, bool AsVendor)> LoadAsync(string orderId, OrderCaller caller, OrderAction action, CancellationToken ct)
    {
        if (action == OrderAction.Cancel && caller.IsCustomer)
        {
            var own = await orders.GetAsync(orderId, caller.Subject, ct);
            if (own is not null) return (own, false);
        }
        if (!caller.IsVendor) return (null, true);
        return (await orders.GetForVendorAsync(orderId, caller.Subject, ct), true);
    }

    private static void Apply(Order order, OrderAction action, bool asVendor, DateTimeOffset now)
    {
        switch (action)
        {
            case OrderAction.Confirm: order.Confirm(now); break;
            case OrderAction.StartPreparation: order.StartPreparation(now); break;
            case OrderAction.MarkReady: order.MarkReady(now); break;
            case OrderAction.Complete: order.Complete(now); break; // moves behind PickupFulfillment when ORD-003 lands
            case OrderAction.Decline: order.Cancel(OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined, now); break;
            case OrderAction.Cancel when asVendor:
                // A vendor cancelling an order they have not yet accepted is a decline; later it is a cancellation.
                order.Cancel(
                    OrderCancelActor.Vendor,
                    order.Status == OrderStatus.Placed ? OrderCancelReason.VendorDeclined : OrderCancelReason.VendorCancelled,
                    now);
                break;
            case OrderAction.Cancel: order.Cancel(OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, now); break;
            default: throw new ArgumentOutOfRangeException(nameof(action));
        }
    }

    /// <summary>
    /// The order is already stored as cancelled, so a failed release cannot be undone by failing the request. It is recorded for cleanup
    /// (open item 62) and the release can be repeated safely.
    /// </summary>
    private async Task ReleaseQuietlyAsync(Order order)
    {
        try
        {
            await catalog.ReleaseAsync(order.Id, order.VendorId, CancellationToken.None);
        }
        catch (Exception e)
        {
            LogStockReservationForCouldNotBe(logger, e, order.Id);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Order {OrderId}: {Action} refused in status {Status}")]
    private static partial void LogOrderRefusedInStatus(ILogger logger, string orderId, OrderingService.Orders.OrderAction action, BakeryMarketplace.EventSchemas.OrderStatus status);

    [LoggerMessage(Level = LogLevel.Information, Message = "Order {OrderId}: {Action} done, now {Status}")]
    private static partial void LogOrderDoneNow(ILogger logger, string orderId, OrderingService.Orders.OrderAction action, BakeryMarketplace.EventSchemas.OrderStatus status);

    [LoggerMessage(Level = LogLevel.Error, Message = "Stock reservation for {OrderId} could not be released; it needs cleanup")]
    private static partial void LogStockReservationForCouldNotBe(ILogger logger, Exception exception, string orderId);
}
