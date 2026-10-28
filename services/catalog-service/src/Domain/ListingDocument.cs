using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace CatalogService.Domain;

/// <summary>Allowed values of <see cref="ListingDocument.Status"/>. Strings, not an enum, so Cosmos LINQ filters stay trivially translatable.</summary>
public static class ListingStatuses
{
    public const string Draft = "Draft";
    public const string Published = "Published";

    public static bool IsValid(string? value) => value is Draft or Published;
}

/// <summary>
/// Stored shape of a Listing in the Cosmos <c>catalog</c> container (partition key <c>/vendorId</c>, ADR-0004).
/// Property names are pinned with Newtonsoft attributes because Cosmos' default serializer is case-sensitive
/// about <c>id</c> and the partition key path. REST responses use separate DTOs (<see cref="Api.ListingDto"/>).
/// </summary>
public sealed class ListingDocument : IETagged
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("vendorId")] public string VendorId { get; set; } = "";
    [JsonProperty("name")] public string Name { get; set; } = "";
    [JsonProperty("description")] public string? Description { get; set; }
    [JsonProperty("category")] public string Category { get; set; } = "";

    /// <summary>Integer cents, USD (first-slice contract D-1).</summary>
    [JsonProperty("priceCents")] public int PriceCents { get; set; }

    [JsonProperty("modifiers")] public List<ModifierDocument> Modifiers { get; set; } = new();
    [JsonProperty("allergenFlags")] public List<string> AllergenFlags { get; set; } = new();

    /// <summary>Stored only; sponsored-slot logic belongs to Advertising (<c>ADV-*</c>).</summary>
    [JsonProperty("sponsored")] public bool Sponsored { get; set; }

    [JsonProperty("status")] public string Status { get; set; } = ListingStatuses.Draft;
    [JsonProperty("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    [JsonProperty("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>Incremented on every save; used as the per-aggregate event sequence number (ADR-0003).</summary>
    [JsonProperty("version")] public long Version { get; set; }

    /// <summary>
    /// Units available to sell (ADR-0017). Absent means made to order: always orderable, never reserved. A number means limited
    /// stock, tracked and enforced; it is a running counter, not tied to a day or window.
    /// </summary>
    [JsonProperty("availableQuantity", NullValueHandling = NullValueHandling.Ignore)] public int? AvailableQuantity { get; set; }

    /// <summary>Largest quantity of this item one order may contain; absent means no per-item limit.</summary>
    [JsonProperty("maxPerOrder", NullValueHandling = NullValueHandling.Ignore)] public int? MaxPerOrder { get; set; }

    /// <summary>At or below this quantity the item is "low"; absent means <see cref="StockPolicy.DefaultLowStockThreshold"/>.</summary>
    [JsonProperty("lowStockThreshold", NullValueHandling = NullValueHandling.Ignore)] public int? LowStockThreshold { get; set; }

    /// <summary>The store's version token (Cosmos <c>_etag</c>), for optimistic concurrency (<see cref="IRepository{T}.SaveIfUnchangedAsync"/>).</summary>
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; set; }
}

public sealed class ModifierDocument
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("name")] public string Name { get; set; } = "";
    [JsonProperty("priceDeltaCents")] public int PriceDeltaCents { get; set; }
    [JsonProperty("allergens")] public List<string> Allergens { get; set; } = new();
}
