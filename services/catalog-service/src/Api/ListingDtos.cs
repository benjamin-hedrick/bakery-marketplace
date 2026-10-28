using CatalogService.Domain;

namespace CatalogService.Api;

// Request bodies. Everything is nullable so "missing" is distinguishable from "zero"/"empty" in validation.
// There is deliberately no vendorId, id, sponsored, createdAt or version here: those are never client-writable.
public sealed record ModifierRequest(string? Id, string? Name, int? PriceDeltaCents, List<string>? Allergens);

public sealed record ListingRequest(
    string? Name,
    string? Description,
    string? Category,
    int? PriceCents,
    List<ModifierRequest>? Modifiers,
    List<string>? AllergenFlags,
    string? Status,
    StockRequest? Stock = null);

/// <summary>
/// Stock settings (ADR-0017). When a listing request has no <c>stock</c> block the stock settings are left as they are (a new listing is
/// made to order). When the block is present it replaces all three settings: a missing <c>availableQuantity</c> means made to order.
/// </summary>
public sealed record StockRequest(int? AvailableQuantity, int? MaxPerOrder, int? LowStockThreshold);

/// <summary>A signed change to the quantity of a limited-stock listing, applied atomically.</summary>
public sealed record StockAdjustRequest(int? Delta);

// Responses (first-slice contract §4). Money is integer cents, USD.
public sealed record ModifierDto(string Id, string Name, int PriceDeltaCents, IReadOnlyList<string> Allergens);

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
    DateTimeOffset UpdatedAt)
{
    /// <summary>The public view: a stock status, never the exact count.</summary>
    public static ListingDto From(ListingDocument d) => Build(d, owner: false);

    /// <summary>The owning vendor's view: also the exact quantity and the low-stock threshold.</summary>
    public static ListingDto ForOwner(ListingDocument d) => Build(d, owner: true);

    private static ListingDto Build(ListingDocument d, bool owner) => new(
        d.Id, d.VendorId, d.Name, d.Description, d.Category, d.PriceCents, "USD",
        d.Modifiers.Select(m => new ModifierDto(m.Id, m.Name, m.PriceDeltaCents, m.Allergens.ToList())).ToList(),
        d.AllergenFlags.ToList(), d.Sponsored, d.Status,
        new StockDto(StockPolicy.StatusOf(d), d.MaxPerOrder,
            owner ? d.AvailableQuantity : null, owner ? d.LowStockThreshold : null),
        d.CreatedAt, d.UpdatedAt);
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
