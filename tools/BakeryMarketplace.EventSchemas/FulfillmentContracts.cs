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
/// <c>Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed</c> (or <c>Cancelled</c>).
/// </summary>
public enum OrderStatus
{
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
    FulfillmentDetails Details
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
