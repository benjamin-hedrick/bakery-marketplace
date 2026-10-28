using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>
/// An order as stored in the Cosmos <c>orders</c> container, partitioned by <c>/customerId</c> (ADR-0004). Property names are pinned with
/// Newtonsoft attributes because Cosmos is case-sensitive about <c>id</c> and the partition key path, and enums are stored as readable
/// strings. It is separate from <see cref="Order"/> on purpose: the aggregate keeps its invariants, the document is just data.
/// Idempotency data (<see cref="IdempotencyKey"/>, <see cref="RequestFingerprint"/>) belongs to the checkout request, not to the order's
/// lifecycle, so it lives only here (first-slice contract D-6).
/// </summary>
public sealed class OrderDocument : IETagged
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("customerId")] public string CustomerId { get; set; } = "";
    [JsonProperty("vendorId")] public string VendorId { get; set; } = "";

    [JsonProperty("status"), JsonConverter(typeof(StringEnumConverter))]
    public OrderStatus Status { get; set; }

    [JsonProperty("fulfillmentType"), JsonConverter(typeof(StringEnumConverter))]
    public FulfillmentType FulfillmentType { get; set; }

    [JsonProperty("pickup", NullValueHandling = NullValueHandling.Ignore)] public PickupDocument? Pickup { get; set; }
    [JsonProperty("delivery", NullValueHandling = NullValueHandling.Ignore)] public DeliveryDocument? Delivery { get; set; }

    [JsonProperty("lines")] public List<OrderLineDocument> Lines { get; set; } = new();

    /// <summary>Integer cents, USD (D-1). Stored for readability and queries; the lines are authoritative.</summary>
    [JsonProperty("totalCents")] public long TotalCents { get; set; }
    [JsonProperty("currency")] public string Currency { get; set; } = OrderRules.Currency;

    [JsonProperty("sequenceNumber")] public long SequenceNumber { get; set; }
    [JsonProperty("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    [JsonProperty("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }

    [JsonProperty("cancelledBy", NullValueHandling = NullValueHandling.Ignore), JsonConverter(typeof(StringEnumConverter))]
    public OrderCancelActor? CancelledBy { get; set; }

    [JsonProperty("cancelReason", NullValueHandling = NullValueHandling.Ignore), JsonConverter(typeof(StringEnumConverter))]
    public OrderCancelReason? CancelReason { get; set; }

    /// <summary>The client's key for the checkout that created the order, unique per customer (D-6). Never logged.</summary>
    [JsonProperty("idempotencyKey", NullValueHandling = NullValueHandling.Ignore)] public string? IdempotencyKey { get; set; }

    /// <summary>A hash of the checkout request, so the same key with a different request is recognised (422 <c>idempotency_key_reuse</c>).</summary>
    [JsonProperty("requestFingerprint", NullValueHandling = NullValueHandling.Ignore)] public string? RequestFingerprint { get; set; }

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; set; }

    public static OrderDocument From(Order order, string? idempotencyKey = null, string? requestFingerprint = null)
    {
        var s = order.ToSnapshot();
        return new OrderDocument
        {
            Id = s.Id,
            CustomerId = s.CustomerId,
            VendorId = s.VendorId,
            Status = s.Status,
            FulfillmentType = s.FulfillmentType,
            Pickup = s.Fulfillment?.Pickup is { } p ? new PickupDocument(p.WindowStart, p.WindowEnd, p.Instructions) : null,
            Delivery = s.Fulfillment?.Delivery is { } d ? new DeliveryDocument(d.Address, d.CourierId, d.EstimatedDeliveryAt, d.Instructions) : null,
            Lines = s.Lines.Select(l => new OrderLineDocument
            {
                ListingId = l.ListingId,
                ModifierIds = l.ModifierIds.ToList(),
                Quantity = l.Quantity,
                UnitPriceCents = l.UnitPriceCents,
                PriceCents = l.LineCents,
            }).ToList(),
            TotalCents = order.TotalCents,
            Currency = order.Currency,
            SequenceNumber = s.SequenceNumber,
            CreatedAt = s.CreatedAt,
            UpdatedAt = s.UpdatedAt,
            CancelledBy = s.CancelledBy,
            CancelReason = s.CancelReason,
            IdempotencyKey = idempotencyKey,
            RequestFingerprint = requestFingerprint,
        };
    }

    /// <summary>Rebuilds the aggregate. Throws <see cref="OrderRuleException"/> if the stored state is not one an order could be in.</summary>
    public Order ToOrder()
    {
        FulfillmentDetails? fulfillment = (Pickup, Delivery) switch
        {
            ({ } p, null) => new FulfillmentDetails(FulfillmentType, Pickup: new PickupFulfillmentDetails(p.WindowStart, p.WindowEnd, p.Instructions)),
            (null, { } d) => new FulfillmentDetails(FulfillmentType, Delivery: new DeliveryFulfillmentDetails(d.Address, d.CourierId, d.EstimatedDeliveryAt, d.Instructions)),
            (null, null) => null,
            _ => throw new OrderRuleException("A stored order has both pickup and delivery details."),
        };

        return Order.Restore(new OrderSnapshot(
            Id, CustomerId, VendorId, FulfillmentType, fulfillment, Status, SequenceNumber, CreatedAt, UpdatedAt, CancelledBy, CancelReason,
            Lines.Select(l => new OrderLine(l.ListingId, l.ModifierIds, l.Quantity, l.UnitPriceCents)).ToList()));
    }
}

public sealed record PickupDocument(
    [property: JsonProperty("windowStart")] DateTimeOffset WindowStart,
    [property: JsonProperty("windowEnd")] DateTimeOffset WindowEnd,
    [property: JsonProperty("instructions", NullValueHandling = NullValueHandling.Ignore)] string? Instructions);

public sealed record DeliveryDocument(
    [property: JsonProperty("address")] string Address,
    [property: JsonProperty("courierId", NullValueHandling = NullValueHandling.Ignore)] string? CourierId,
    [property: JsonProperty("estimatedDeliveryAt", NullValueHandling = NullValueHandling.Ignore)] DateTimeOffset? EstimatedDeliveryAt,
    [property: JsonProperty("instructions", NullValueHandling = NullValueHandling.Ignore)] string? Instructions);

public sealed class OrderLineDocument
{
    [JsonProperty("listingId")] public string ListingId { get; set; } = "";
    [JsonProperty("modifierIds")] public List<string> ModifierIds { get; set; } = new();
    [JsonProperty("quantity")] public int Quantity { get; set; }
    [JsonProperty("unitPriceCents")] public int UnitPriceCents { get; set; }
    [JsonProperty("priceCents")] public long PriceCents { get; set; }
}
