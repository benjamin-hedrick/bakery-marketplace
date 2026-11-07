namespace BakeryMarketplace.EventSchemas;

/// <summary>
/// Fulfillment type enumeration supported by the marketplace.
/// See ADR-0001 and WI-ORD-004.
/// </summary>
public enum FulfillmentType
{
    /// <summary>
    /// Customer pick up at vendor location (v1 implemented strategy).
    /// </summary>
    Pickup,

    /// <summary>
    /// Courier delivery to customer (v2 deferred strategy seam).
    /// </summary>
    Delivery
}

/// <summary>
/// Fulfillment-agnostic Order lifecycle status vocabulary.
/// Vocabulary matches ADR-0001, WI-ORD-004, and glossary.md:
/// <c>Pending → Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed</c> (or <c>Cancelled</c>).
/// <c>Pending</c> is the customer building the order; see docs/architecture/order-lifecycle.md.
/// </summary>
public enum OrderStatus
{
    Pending,
    Placed,
    Confirmed,
    InPreparation,
    ReadyForFulfillment,
    Completed,
    Cancelled
}

/// <summary>
/// Strategy-specific payload for pickup fulfillment slot scheduling.
/// </summary>
public record PickupFulfillmentDetails(
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    string? Instructions = null
);

/// <summary>
/// Strategy-specific payload for delivery fulfillment dispatch details (v2 seam).
/// </summary>
public record DeliveryFulfillmentDetails(
    string Address,
    string? CourierId = null,
    DateTimeOffset? EstimatedDeliveryAt = null,
    string? Instructions = null
);

/// <summary>
/// Discriminated, strategy-agnostic container for fulfillment details stored opaquely
/// by the Order aggregate per ADR-0001 and WI-ORD-004.
/// </summary>
public record FulfillmentDetails(
    FulfillmentType Type,
    PickupFulfillmentDetails? Pickup = null,
    DeliveryFulfillmentDetails? Delivery = null
)
{
    /// <summary>
    /// Creates a pickup fulfillment details container.
    /// </summary>
    public static FulfillmentDetails ForPickup(DateTimeOffset windowStart, DateTimeOffset windowEnd, string? instructions = null)
        => new(FulfillmentType.Pickup, Pickup: new PickupFulfillmentDetails(windowStart, windowEnd, instructions));

    /// <summary>
    /// Creates a delivery fulfillment details container.
    /// </summary>
    public static FulfillmentDetails ForDelivery(string address, string? courierId = null, DateTimeOffset? estimatedDeliveryAt = null, string? instructions = null)
        => new(FulfillmentType.Delivery, Delivery: new DeliveryFulfillmentDetails(address, courierId, estimatedDeliveryAt, instructions));
}

/// <summary>
/// Domain event published when an order enters <see cref="OrderStatus.ReadyForFulfillment"/> state.
/// Concrete fulfillment strategies (such as PickupFulfillment in v1 or DeliveryFulfillment in v2)
/// consume this event asynchronously per the ADR-0001 seam design.
/// </summary>
public record OrderReadyForFulfillmentPayload(
    string OrderId,
    string VendorId,
    FulfillmentType FulfillmentType,
    FulfillmentDetails Details,
    string? CustomerId = null
);

/// <summary>
/// Event names of the fulfillment seam (ADR-0001, WI-ORD-003). Ordering raises <c>OrderConfirmed</c> and <c>OrderReadyForFulfillment</c>
/// and asks for a confirmation; a strategy answers with the rest.
/// </summary>
public static class FulfillmentEventTypes
{
    /// <summary>Published by ordering's <c>complete</c> endpoint: the vendor says the order was handed over.</summary>
    public const string ConfirmationRequested = "OrderFulfillmentConfirmationRequested";

    /// <summary>Published by the strategy when it accepts the confirmation; ordering completes the order on it.</summary>
    public const string Completed = "OrderFulfillmentCompleted";

    /// <summary>Pickup strategy events.</summary>
    public const string PickupWindowScheduled = "PickupWindowScheduled";

    public const string ReadyForPickup = "OrderReadyForPickup";
}

/// <summary>
/// The vendor asked to complete the fulfillment of an order that is <see cref="OrderStatus.ReadyForFulfillment"/> (ADR-0001, WI-ORD-003).
/// A plain integration event: it changes nothing in the order. The strategy for the type decides whether to accept it.
/// </summary>
public record OrderFulfillmentConfirmationRequestedPayload(
    string OrderId,
    string VendorId,
    string CustomerId,
    FulfillmentType FulfillmentType,
    DateTimeOffset RequestedAt
);

/// <summary>
/// Domain event published when fulfillment is completed and the order enters <see cref="OrderStatus.Completed"/> state.
/// </summary>
public record OrderFulfillmentCompletedPayload(
    string OrderId,
    string VendorId,
    FulfillmentType FulfillmentType,
    DateTimeOffset CompletedAt
);
