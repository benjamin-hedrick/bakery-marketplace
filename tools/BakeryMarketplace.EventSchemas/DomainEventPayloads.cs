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

public record OrderPlacedPayload(
    string OrderId,
    string CustomerId,
    string VendorId,
    IReadOnlyList<LineItemPayload> LineItems
);

public record OrderCustomizedPayload(
    string OrderId,
    IReadOnlyList<LineItemPayload> UpdatedLineItems
);

public record PickupWindowScheduledPayload(
    string OrderId,
    DateTimeOffset WindowStart,
    DateTimeOffset WindowEnd
);

public record OrderReadyForPickupPayload(
    string OrderId
);

public record OrderCompletedPayload(
    string OrderId,
    DateTimeOffset CompletedAt
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
