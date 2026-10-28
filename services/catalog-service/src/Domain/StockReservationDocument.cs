using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace CatalogService.Domain;

public static class ReservationStates
{
    public const string Active = "Active";
    public const string Released = "Released";
}

/// <summary>One listing's share of a reservation. <see cref="Limited"/> records whether stock was actually taken, so a release returns only that.</summary>
public sealed class ReservationLineDocument
{
    [JsonProperty("listingId")] public string ListingId { get; set; } = "";
    [JsonProperty("quantity")] public int Quantity { get; set; }
    [JsonProperty("limited")] public bool Limited { get; set; }
}

/// <summary>
/// The record of stock reserved for one order (ADR-0017, WI-CAT-006). Stored in the <c>catalog</c> container in the vendor's partition
/// (<c>/vendorId</c>), which is what lets the decrements and this record commit in one transactional batch. It is keyed by the order id, so
/// a repeated reserve or release is recognised. It has no <c>status</c> property, so it never matches the listing queries
/// that filter on <c>status</c>.
/// </summary>
public sealed class StockReservationDocument : IETagged
{
    public static string IdFor(string orderId) => $"reservation-{orderId}";

    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("vendorId")] public string VendorId { get; set; } = "";
    [JsonProperty("docType")] public string DocType { get; set; } = "stockReservation";
    [JsonProperty("orderId")] public string OrderId { get; set; } = "";
    [JsonProperty("state")] public string State { get; set; } = ReservationStates.Active;
    [JsonProperty("lines")] public List<ReservationLineDocument> Lines { get; set; } = new();
    [JsonProperty("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    [JsonProperty("releasedAt", NullValueHandling = NullValueHandling.Ignore)] public DateTimeOffset? ReleasedAt { get; set; }

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; set; }
}
