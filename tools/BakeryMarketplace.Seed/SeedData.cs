using CatalogService.Domain;
using CatalogService.Preferences;

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

    // Customers with a saved allergen profile (WI-MOB-002). The ids are the ones the mock identity gives these customers (BakeryMarketplace.Auth, MockUsers); a catalog test
    // keeps the two lists in step. Alice (user-customer-1) has no profile on purpose: she is the customer who never saved one. Allergen ids are the tag registry's.
    public const string TreeNutAllergyCustomerId = "user-customer-treenut";
    public const string SesameAllergyCustomerId = "user-customer-sesame";
    public const string AvoidsDairyCustomerId = "user-customer-avoiddairy";
    public const string SeveralCustomerId = "user-customer-several";

    /// <summary>
    /// The saved profiles of the seeded customers, one case each: a serious allergy on the item and on an option (tree nut), a serious allergy that only an
    /// option carries (sesame, on the sourdough's "Add seeds"), a preference only (avoids dairy: shown, never needs an acknowledgement), and several at once.
    /// </summary>
    public static IReadOnlyList<PreferenceProfileDocument> CustomerProfiles() =>
    [
        Profile(TreeNutAllergyCustomerId, allergies: ["tree-nut"], avoid: []),
        Profile(SesameAllergyCustomerId, allergies: ["sesame"], avoid: []),
        Profile(AvoidsDairyCustomerId, allergies: [], avoid: ["dairy"]),
        Profile(SeveralCustomerId, allergies: ["dairy", "tree-nut"], avoid: ["gluten"]),
    ];

    private static PreferenceProfileDocument Profile(string customerId, string[] allergies, string[] avoid) =>
        new() { Id = customerId, CustomerId = customerId, Allergies = allergies.ToList(), Avoid = avoid.ToList(), Prefer = [], UpdatedAt = Stamp };

    // The allergen flag sets shared by several listings (Listing() copies them, so sharing is safe).
    private static readonly string[] Gluten = ["gluten"];
    private static readonly string[] GlutenDairyTreeNut = ["gluten", "dairy", "tree-nut"];
    private static readonly string[] GlutenDairyEgg = ["gluten", "dairy", "egg"];

    private static ListingDocument[] BaseListings() => new[]
    {
        Listing("listing-sourdough-001", ShopVendorId, "Country Sourdough", "bread", 800,
            "A naturally leavened country loaf.",
            Gluten,
            Mod("mod-seeds", "Add seeds", 100, "sesame"), Mod("mod-sliced", "Sliced", 0)),
        Listing("listing-croissant-001", ShopVendorId, "Almond Croissant", "pastry", 450,
            "Butter croissant filled with almond cream.",
            GlutenDairyTreeNut,
            Mod("mod-extra-almond", "Extra almonds", 75, "tree-nut")),
        Listing("listing-latte-001", ShopVendorId, "Oat Milk Latte", "coffee", 500,
            "Espresso with steamed oat milk.",
            Array.Empty<string>(),
            Mod("mod-extra-shot", "Extra shot", 75), Mod("mod-vanilla", "Vanilla syrup", 50)),
        Listing("listing-cookies-001", IndependentVendorId, "Brown Butter Cookies", "cookies", 350,
            "Half-dozen brown butter cookies.",
            GlutenDairyEgg,
            Mod("mod-sea-salt", "Sea salt finish", 0)),
        Listing("listing-lemon-loaf-001", IndependentVendorId, "Lemon Loaf", "cake", 600,
            "Glazed lemon loaf cake.",
            GlutenDairyEgg),
        Listing("listing-muffin-001", IndependentVendorId, "Blueberry Oat Muffin", "pastry", 400,
            "Blueberry muffin made with oat flour.",
            Gluten,
            Mod("mod-walnuts", "Add walnuts", 50, "tree-nut")),
        // Negative case: must never appear in browse (publish gate / Published filter).
        Listing("listing-draft-001", ShopVendorId, "Draft Seasonal Tart", "pastry", 300,
            "Unfinished listing used to prove the publish gate.",
            Array.Empty<string>(),
            status: ListingStatuses.Draft),
    };

    // Stock (ADR-0017): sourdough limited and in stock, croissant limited and low (4 is at or below the placeholder threshold of 5),
    // muffin sold out, cookies limited with a per-order maximum, latte and lemon loaf made to order. A listing that already exists is
    // left alone when the seed re-runs, so an existing local database keeps its old values until it is reset.
    private static readonly Dictionary<string, (int Quantity, int? MaxPerOrder)> Stock = new()
    {
        ["listing-sourdough-001"] = (12, 4),
        ["listing-croissant-001"] = (4, null),
        ["listing-cookies-001"] = (24, 6),
        ["listing-muffin-001"] = (0, null),
    };

    // Tags (WI-TAG-002, ADR-0022): a few diet, occasion and season tags, one with a window, and one hidden platform tag that only tests look for.
    private static readonly IReadOnlyDictionary<string, string[]> VendorTags = new Dictionary<string, string[]>
    {
        ["listing-sourdough-001"] = ["vegan", "local-favourite"],
        ["listing-croissant-001"] = ["vegetarian", "autumn", "thanksgiving"],
        ["listing-cookies-001"] = ["birthday"],
    };

    // Option tags (WI-TAG-004): the seed crust carries the vegan tag, "Sliced" deliberately does not, so a customer who prefers vegan sees the rule both ways on
    // the sourdough (the claim holds with the seed crust, and not with Sliced, because the bakery has not marked that option).
    private static readonly IReadOnlyDictionary<string, string[]> OptionTags = new Dictionary<string, string[]>
    {
        ["mod-seeds"] = ["vegan"],
    };

    private static readonly IReadOnlyDictionary<string, string[]> PlatformTags = new Dictionary<string, string[]>
    {
        ["listing-croissant-001"] = ["test-hidden"],
    };

    public static IReadOnlyList<ListingDocument> Listings()
    {
        var all = BaseListings();
        foreach (var listing in all)
        {
            if (VendorTags.TryGetValue(listing.Id, out var tags)) listing.Tags = tags.ToList();
            if (PlatformTags.TryGetValue(listing.Id, out var platform)) listing.PlatformTags = platform.ToList();
            if (listing.Id == "listing-sourdough-001")
            {
                foreach (var option in listing.Modifiers)
                    if (OptionTags.TryGetValue(option.Id, out var optionTags)) option.Tags = optionTags.ToList();
            }
            if (!Stock.TryGetValue(listing.Id, out var stock)) continue;
            listing.AvailableQuantity = stock.Quantity;
            listing.MaxPerOrder = stock.MaxPerOrder;
        }
        return all;
    }

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
            Id = id,
            VendorId = vendorId,
            Name = name,
            Category = category,
            PriceCents = priceCents,
            Description = description,
            AllergenFlags = allergenFlags.ToList(),
            Modifiers = modifiers.ToList(),
            Sponsored = false,
            Status = status,
            CreatedAt = Stamp,
            UpdatedAt = Stamp,
            Version = 1,
        };
}
