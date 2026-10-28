using CatalogService.Domain;

namespace BakeryMarketplace.Seed;

/// <summary>
/// Deterministic local-dev fixtures. Ids, prices and totals follow <c>docs/architecture/first-slice-contract.md</c> §7
/// so tests, SSR smoke and Playwright can assert exact values. Timestamps are fixed so re-running changes nothing.
/// Money is integer cents, USD (D-1).
/// </summary>
public static class SeedData
{
    public static readonly DateTimeOffset Stamp = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public const string ShopVendorId = "vendor-shop-001";
    public const string IndependentVendorId = "vendor-indep-001";

    /// <summary>Vendor id → vendor type (glossary: Shop, Independent). Both are published as <c>VendorVerified</c>.</summary>
    public static readonly IReadOnlyDictionary<string, string> Vendors = new Dictionary<string, string>
    {
        [ShopVendorId] = "Shop",
        [IndependentVendorId] = "Independent",
    };

    public static IReadOnlyList<ListingDocument> Listings() => new[]
    {
        Listing("listing-sourdough-001", ShopVendorId, "Country Sourdough", "bread", 800,
            "A naturally leavened country loaf.",
            new[] { "gluten" },
            Mod("mod-seeds", "Add seeds", 100, "sesame"), Mod("mod-sliced", "Sliced", 0)),
        Listing("listing-croissant-001", ShopVendorId, "Almond Croissant", "pastry", 450,
            "Butter croissant filled with almond cream.",
            new[] { "gluten", "dairy", "tree-nut" },
            Mod("mod-extra-almond", "Extra almonds", 75, "tree-nut")),
        Listing("listing-latte-001", ShopVendorId, "Oat Milk Latte", "coffee", 500,
            "Espresso with steamed oat milk.",
            Array.Empty<string>(),
            Mod("mod-extra-shot", "Extra shot", 75), Mod("mod-vanilla", "Vanilla syrup", 50)),
        Listing("listing-cookies-001", IndependentVendorId, "Brown Butter Cookies", "cookies", 350,
            "Half-dozen brown butter cookies.",
            new[] { "gluten", "dairy", "egg" },
            Mod("mod-sea-salt", "Sea salt finish", 0)),
        Listing("listing-lemon-loaf-001", IndependentVendorId, "Lemon Loaf", "cake", 600,
            "Glazed lemon loaf cake.",
            new[] { "gluten", "dairy", "egg" }),
        Listing("listing-muffin-001", IndependentVendorId, "Blueberry Oat Muffin", "pastry", 400,
            "Blueberry muffin made with oat flour.",
            new[] { "gluten" },
            Mod("mod-walnuts", "Add walnuts", 50, "tree-nut")),
        // Negative case: must never appear in browse (publish gate / Published filter).
        Listing("listing-draft-001", ShopVendorId, "Draft Seasonal Tart", "pastry", 300,
            "Unfinished listing used to prove the publish gate.",
            Array.Empty<string>(),
            status: ListingStatuses.Draft),
    };

    private static ModifierDocument Mod(string id, string name, int deltaCents, params string[] allergens) =>
        new() { Id = id, Name = name, PriceDeltaCents = deltaCents, Allergens = allergens.ToList() };

    private static ListingDocument Listing(
        string id, string vendorId, string name, string category, int priceCents, string description,
        string[] allergenFlags, params ModifierDocument[] modifiers) =>
        Listing(id, vendorId, name, category, priceCents, description, allergenFlags, ListingStatuses.Published, modifiers);

    private static ListingDocument Listing(
        string id, string vendorId, string name, string category, int priceCents, string description,
        string[] allergenFlags, string status, params ModifierDocument[] modifiers) =>
        new()
        {
            Id = id, VendorId = vendorId, Name = name, Category = category, PriceCents = priceCents,
            Description = description, AllergenFlags = allergenFlags.ToList(), Modifiers = modifiers.ToList(),
            Sponsored = false, Status = status, CreatedAt = Stamp, UpdatedAt = Stamp, Version = 1,
        };
}
