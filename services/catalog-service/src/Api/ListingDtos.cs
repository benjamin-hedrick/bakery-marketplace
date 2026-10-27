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
    string? Status);

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
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static ListingDto From(ListingDocument d) => new(
        d.Id, d.VendorId, d.Name, d.Description, d.Category, d.PriceCents, "USD",
        d.Modifiers.Select(m => new ModifierDto(m.Id, m.Name, m.PriceDeltaCents, m.Allergens.ToList())).ToList(),
        d.AllergenFlags.ToList(), d.Sponsored, d.Status, d.CreatedAt, d.UpdatedAt);
}

public sealed record ListingPage(IReadOnlyList<ListingDto> Items, string? NextCursor);

/// <summary>Stable, client-safe error body: a machine-readable code plus optional per-field messages.</summary>
public sealed record ApiError(string Code, string Message, IReadOnlyDictionary<string, string[]>? Errors = null);
