using BakeryMarketplace.EventSchemas;

namespace OrderingService.Domain;

/// <summary>Order limits. The line bounds are placeholders (first-slice contract D-5) until per-item maximums exist (open item 51).</summary>
public static class OrderRules
{
    public const int MaxLines = 10;
    public const int MaxQuantityPerLine = 20;
    public const string Currency = "USD";
}

/// <summary>A transition is not allowed from the order's current status, or by that actor.</summary>
public sealed class InvalidOrderTransitionException(string message) : InvalidOperationException(message);

/// <summary>An input or invariant of the order is violated (bad quantity, too many lines, empty order, and so on).</summary>
public sealed class OrderRuleException(string message) : InvalidOperationException(message);

/// <summary>
/// Event type names the Order aggregate raises. Strategy-specific events (<c>PickupWindowScheduled</c>, <c>OrderReadyForPickup</c>)
/// are raised by the fulfillment strategy, not by the Order (ADR-0001, docs/architecture/order-lifecycle.md).
/// </summary>
public static class OrderEventTypes
{
    public const string Placed = "OrderPlaced";
    public const string Confirmed = "OrderConfirmed";
    public const string PreparationStarted = "OrderPreparationStarted";
    public const string ReadyForFulfillment = "OrderReadyForFulfillment";
    public const string Completed = "OrderCompleted";
    public const string Cancelled = "OrderCancelled";
}

/// <summary>
/// A domain event raised by the aggregate, as data. <c>ORD-005</c> wraps it in a <c>DomainEventEnvelope&lt;T&gt;</c>
/// (aggregate id = the order id) and publishes it; the aggregate never publishes anything itself.
/// </summary>
public sealed record OrderEvent(string EventType, object Payload, long SequenceNumber, DateTimeOffset OccurredAt);

/// <summary>
/// One line of an order: a listing, the chosen modifiers, a quantity and the unit price in integer cents (D-1).
/// The price is set by <c>ordering-service</c> from catalog data at checkout, never taken from the client.
/// </summary>
public sealed record OrderLine
{
    public string ListingId { get; }
    public IReadOnlyList<string> ModifierIds { get; }
    public int Quantity { get; }
    public int UnitPriceCents { get; }

    public OrderLine(string listingId, IEnumerable<string> modifierIds, int quantity, int unitPriceCents)
    {
        if (string.IsNullOrWhiteSpace(listingId)) throw new OrderRuleException("A line needs a listing.");
        var modifiers = (modifierIds ?? throw new ArgumentNullException(nameof(modifierIds))).ToArray();
        if (modifiers.Any(string.IsNullOrWhiteSpace)) throw new OrderRuleException("A modifier id cannot be empty.");
        if (modifiers.Distinct().Count() != modifiers.Length) throw new OrderRuleException("A modifier can be chosen only once per line.");
        if (quantity < 1 || quantity > OrderRules.MaxQuantityPerLine)
            throw new OrderRuleException($"Quantity must be between 1 and {OrderRules.MaxQuantityPerLine}.");
        if (unitPriceCents < 0) throw new OrderRuleException("A unit price cannot be negative.");

        ListingId = listingId;
        ModifierIds = Array.AsReadOnly(modifiers);
        Quantity = quantity;
        UnitPriceCents = unitPriceCents;
    }

    /// <summary>Unit price times quantity, in a <see cref="long"/> so ten maximum lines cannot overflow.</summary>
    public long LineCents => (long)UnitPriceCents * Quantity;

    // Value equality over the modifier contents (a record would compare the array reference).
    public bool Equals(OrderLine? other) =>
        other is not null && ListingId == other.ListingId && Quantity == other.Quantity
        && UnitPriceCents == other.UnitPriceCents && ModifierIds.SequenceEqual(other.ModifierIds);

    public override int GetHashCode() => HashCode.Combine(ListingId, Quantity, UnitPriceCents, ModifierIds.Count);
}

/// <summary>An order's stored state, used by persistence (<see cref="Order.ToSnapshot"/>, <see cref="Order.Restore"/>).</summary>
public sealed record OrderSnapshot(
    string Id,
    string CustomerId,
    string VendorId,
    FulfillmentType FulfillmentType,
    FulfillmentDetails? Fulfillment,
    OrderStatus Status,
    long SequenceNumber,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    OrderCancelActor? CancelledBy,
    OrderCancelReason? CancelReason,
    IReadOnlyList<OrderLine> Lines);
