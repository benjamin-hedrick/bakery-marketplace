using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace OrderingService.Persistence;

/// <summary>
/// One order as a vendor sees it: a summary kept in the Cosmos <c>vendor-orders</c> container, partitioned by <c>/vendorId</c> and fed
/// by the order events (register items 76 and 63's counterpart, <c>N-03</c>). It is a read model, not a second source of truth: the order
/// in the <c>orders</c> container is authoritative, and this document may lag it by the time the events take. It exists so the vendor's
/// "my orders" list and the lookup of the customer behind an order id are one partition read instead of a fan-out across every customer.
/// </summary>
public sealed class VendorOrderDocument : IETagged
{
    /// <summary>The order id.</summary>
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("vendorId")] public string VendorId { get; set; } = "";

    /// <summary>The customer's id, which is the partition of the order itself. Kept for the lookup; never returned to the vendor.</summary>
    [JsonProperty("customerId", NullValueHandling = NullValueHandling.Ignore)] public string? CustomerId { get; set; }

    [JsonProperty("status"), JsonConverter(typeof(StringEnumConverter))] public OrderStatus Status { get; set; }

    [JsonProperty("totalCents", NullValueHandling = NullValueHandling.Ignore)] public long? TotalCents { get; set; }
    [JsonProperty("currency", NullValueHandling = NullValueHandling.Ignore)] public string? Currency { get; set; }
    [JsonProperty("lineCount", NullValueHandling = NullValueHandling.Ignore)] public int? LineCount { get; set; }
    [JsonProperty("itemCount", NullValueHandling = NullValueHandling.Ignore)] public int? ItemCount { get; set; }

    [JsonProperty("fulfillmentType", NullValueHandling = NullValueHandling.Ignore), JsonConverter(typeof(StringEnumConverter))]
    public FulfillmentType? FulfillmentType { get; set; }

    [JsonProperty("pickupStart", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? PickupStart { get; set; }
    [JsonProperty("pickupEnd", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? PickupEnd { get; set; }

    /// <summary>What was ordered, as ids: the vendor view turns them into names (register item 113). Absent on documents written before this existed.</summary>
    [JsonProperty("lines", NullValueHandling = NullValueHandling.Ignore)] public List<VendorOrderLineDocument>? Lines { get; set; }

    /// <summary>The allergens the customer told the bakery about for this order (registry ids), from <c>OrderPlaced</c>. Absent when none (WI-ORD-009). Only this vendor reads it.</summary>
    [JsonProperty("allergens", NullValueHandling = NullValueHandling.Ignore)] public List<string>? Allergens { get; set; }

    [JsonProperty("pickupInstructions", NullValueHandling = NullValueHandling.Ignore)] public string? PickupInstructions { get; set; }

    /// <summary>True when checkout confirmed the order by rule, so it never reached the vendor as a decision.</summary>
    [JsonProperty("automatic")] public bool Automatic { get; set; }

    [JsonProperty("cancelledBy", NullValueHandling = NullValueHandling.Ignore), JsonConverter(typeof(StringEnumConverter))]
    public OrderCancelActor? CancelledBy { get; set; }

    [JsonProperty("cancelReason", NullValueHandling = NullValueHandling.Ignore), JsonConverter(typeof(StringEnumConverter))]
    public OrderCancelReason? CancelReason { get; set; }

    /// <summary>When the order was placed (the time of its <c>OrderPlaced</c> event). Absent until that event has been seen.</summary>
    [JsonProperty("placedAt", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? PlacedAt { get; set; }

    /// <summary>The time of the latest event applied; the list is ordered by it, newest first.</summary>
    [JsonProperty("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }

    /// <summary><see cref="UpdatedAt"/> in UTC milliseconds, a number the store can order and compare without date handling.</summary>
    [JsonProperty("updatedAtMs")] public long UpdatedAtMs { get; set; }

    /// <summary>The highest event sequence number that set <see cref="Status"/>. An event at or below it never changes the status, so a duplicate or late event is harmless.</summary>
    [JsonProperty("lastSequence")] public long LastSequence { get; set; }

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; set; }
}

/// <summary>One line of an order in the read model: the listing, the chosen modifiers and the quantity, all as ids.</summary>
public sealed class VendorOrderLineDocument
{
    [JsonProperty("listingId")] public string ListingId { get; set; } = "";
    [JsonProperty("modifierIds")] public List<string> ModifierIds { get; set; } = new();
    [JsonProperty("quantity")] public int Quantity { get; set; }
}
