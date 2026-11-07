using System.Text.Json.Serialization;

namespace BakeryMarketplace.EventSchemas;

/// <summary>
/// Domain event payload records for all named events across the Bakery Marketplace platform.
/// See WI-TOOL-001 and glossary.md for event names and field specifications.
/// </summary>

public record LineItemPayload(
    string ListingId,
    IReadOnlyList<string> ModifierIds,
    int Quantity
);

/// <summary>
/// <c>TotalCents</c> and <c>Currency</c> were added 2026-10-28 (additive, optional): a receipt or vendor notification needs the
/// amount. Older messages without them still deserialize.
/// <c>FulfillmentType</c> and <c>Details</c> (the requested pickup window and instructions) were added 2026-11-01 (additive, optional): an
/// order waits for the vendor exactly when it has a modifier or a requested window, so the vendor's decision needs the window at placement,
/// not only after confirmation. They are absent when no window was requested.
/// <c>Allergens</c> (registry allergen ids, sorted) were added 2026-11-04 (additive, optional; WI-ORD-009): the allergens the customer chose to tell the
/// bakery about for this order. Absent (null) when none were chosen, so an order without them has the payload it always had. Only the vendor read
/// model consumes it; no notification prints it.
/// </summary>
public record OrderPlacedPayload(
    string OrderId,
    string CustomerId,
    string VendorId,
    IReadOnlyList<LineItemPayload> LineItems,
    long? TotalCents = null,
    string? Currency = null,
    FulfillmentType? FulfillmentType = null,
    FulfillmentDetails? Details = null,
    IReadOnlyList<string>? Allergens = null
);

public record OrderCustomizedPayload(
    string OrderId,
    IReadOnlyList<LineItemPayload> UpdatedLineItems
);

/// <summary>
/// The pickup strategy scheduled the window the customer requested (WI-ORD-003). <c>VendorId</c> and <c>CustomerId</c> were added
/// 2026-11-08 (additive, optional) so the notification service does not have to call back into Ordering.
/// </summary>
public record PickupWindowScheduledPayload(
    string OrderId,
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd,
    string? VendorId = null,
    string? CustomerId = null
);

/// <summary>Who cancelled an order (docs/architecture/order-lifecycle.md).</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OrderCancelActor
{
    Customer,
    Vendor
}

/// <summary>
/// Why an order was cancelled. A code, never free text: a reason typed by a person may contain personal data.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum OrderCancelReason
{
    CustomerRequested,
    VendorDeclined,
    VendorCancelled
}

/// <summary>
/// The order was accepted: by the vendor, or automatically at checkout when it had no customization and no requested pickup window
/// (<c>Automatic</c>, WI-ORD-008). <c>FulfillmentType</c> and <c>Details</c> let the fulfillment strategy (for pickup,
/// <c>PickupFulfillment</c>) schedule what was requested without calling back into Ordering (ADR-0001). Optional, so a
/// message without them still deserializes (and one without <c>Automatic</c> was a vendor's acceptance).
/// <c>VendorId</c> and <c>CustomerId</c> were added 2026-11-01 (additive, optional) on this and the other order lifecycle events, so a
/// consumer that keys by vendor (the vendor order read model, <c>N-03</c>) does not have to call back into Ordering to find them.
/// </summary>
public record OrderConfirmedPayload(
    string OrderId,
    FulfillmentType? FulfillmentType = null,
    FulfillmentDetails? Details = null,
    bool Automatic = false,
    string? VendorId = null,
    string? CustomerId = null
);

/// <summary>The vendor started preparing the order.</summary>
public record OrderPreparationStartedPayload(
    string OrderId,
    string? VendorId = null,
    string? CustomerId = null
);

public record OrderCancelledPayload(
    string OrderId,
    OrderCancelActor CancelledBy,
    OrderCancelReason Reason,
    string? VendorId = null,
    string? CustomerId = null
);

/// <summary>
/// The pickup strategy tells the customer-facing side that the order can be collected (WI-ORD-003). <c>VendorId</c>, <c>CustomerId</c>,
/// the window and <c>Instructions</c> were added 2026-11-08 (additive, optional), like the lifecycle events' ids on 2026-11-01.
/// </summary>
public record OrderReadyForPickupPayload(
    string OrderId,
    string? VendorId = null,
    string? CustomerId = null,
    DateTimeOffset? WindowStart = null,
    DateTimeOffset? WindowEnd = null,
    string? Instructions = null
);

public record OrderCompletedPayload(
    string OrderId,
    DateTimeOffset CompletedAt,
    string? VendorId = null,
    string? CustomerId = null
);

public record VendorVerifiedPayload(
    string VendorId
);

public record VendorSuspendedPayload(
    string VendorId,
    string Reason
);

public record ListingPublishedPayload(
    string ListingId,
    string VendorId
);

public record ListingSponsoredPayload(
    string ListingId
);

public record ListingApprovedPayload(
    string ListingId
);

public record ListingRejectedPayload(
    string ListingId,
    string Reason
);

public record ReviewSubmittedPayload(
    string ReviewId,
    string OrderId,
    string VendorId,
    int Rating
);

public record PayoutReconciledPayload(
    string PayoutId,
    string VendorId,
    decimal NetAmount
);

public record LowStockDetectedPayload(
    string ListingId,
    string VendorId
);
