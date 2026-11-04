using CatalogService.Domain;
using CatalogService.Tags;

namespace CatalogService.Api;

// Request bodies. Everything is nullable so "missing" is distinguishable from "zero"/"empty" in validation.
// There is deliberately no vendorId, id, sponsored, createdAt or version here: those are never client-writable.
/// <summary>Tags (WI-TAG-002): registry ids of a kind other than allergen. Null leaves the option's tags as they were; an empty list clears them.</summary>
public sealed record ModifierRequest(string? Id, string? Name, int? PriceDeltaCents, List<string>? Allergens, List<string>? Tags = null);

public sealed record ListingRequest(
    string? Name,
    string? Description,
    string? Category,
    int? PriceCents,
    List<ModifierRequest>? Modifiers,
    List<string>? AllergenFlags,
    string? Status,
    StockRequest? Stock = null,
    List<string>? Tags = null);

/// <summary>
/// Stock settings (ADR-0017). When a listing request has no <c>stock</c> block the stock settings are left as they are (a new listing is
/// made to order). When the block is present it replaces all three settings: a missing <c>availableQuantity</c> means made to order.
/// </summary>
public sealed record StockRequest(int? AvailableQuantity, int? MaxPerOrder, int? LowStockThreshold);

/// <summary>A signed change to the quantity of a limited-stock listing, applied atomically.</summary>
public sealed record StockAdjustRequest(int? Delta);

// Responses (first-slice contract §4). Money is integer cents, USD.
public sealed record ModifierDto(string Id, string Name, int PriceDeltaCents, IReadOnlyList<string> Allergens, IReadOnlyList<ListingTagDto> Tags);

public sealed record ListingDto(
    string Id,
    string VendorId,
    string Name,
    string? Description,
    string Category,
    int PriceCents,
    string Currency,
    IReadOnlyList<ModifierDto> Modifiers,
    IReadOnlyList<string> AllergenFlags,
    bool Sponsored,
    string Status,
    StockDto Stock,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<ListingTagDto> Tags)
{
    /// <summary>The public view: a stock status, never the exact count.</summary>
    public static ListingDto From(ListingDocument d, TagProjector tags) => Build(d, owner: false, tags);

    /// <summary>The owning vendor's view: also the exact quantity and the low-stock threshold.</summary>
    public static ListingDto ForOwner(ListingDocument d, TagProjector tags) => Build(d, owner: true, tags);

    private static ListingDto Build(ListingDocument d, bool owner, TagProjector tags) => new(
        d.Id, d.VendorId, d.Name, d.Description, d.Category, d.PriceCents, "USD",
        d.Modifiers.Select(m => new ModifierDto(m.Id, m.Name, m.PriceDeltaCents, m.Allergens.ToList(),
            owner ? tags.Owner(m.Tags) : tags.Public(m.Tags, m.PlatformTags))).ToList(),
        d.AllergenFlags.ToList(), d.Sponsored, d.Status,
        new StockDto(StockPolicy.StatusOf(d), d.MaxPerOrder,
            owner ? d.AvailableQuantity : null, owner ? d.LowStockThreshold : null),
        d.CreatedAt, d.UpdatedAt,
        owner ? tags.Owner(d.Tags) : tags.Public(d.Tags, d.PlatformTags));
}

/// <summary>
/// <c>status</c> is <c>inStock</c>, <c>low</c> or <c>soldOut</c> (made to order is always <c>inStock</c>). The quantity and threshold are
/// serialized only in the owner's view, and only when set, so "no <c>availableQuantity</c>" reads as made to order.
/// </summary>
public sealed record StockDto(
    string Status,
    int? MaxPerOrder,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    int? AvailableQuantity = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    int? LowStockThreshold = null);

public sealed record ListingPage(IReadOnlyList<ListingDto> Items, string? NextCursor);

/// <summary>Stable, client-safe error body: a machine-readable code plus optional per-field messages.</summary>
public sealed record ApiError(string Code, string Message, IReadOnlyDictionary<string, string[]>? Errors = null);
