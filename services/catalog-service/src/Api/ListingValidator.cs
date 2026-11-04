using System.Text.RegularExpressions;
using CatalogService.Domain;

namespace CatalogService.Api;

/// <summary>
/// Structural validation of listing input. Business gates (vendor verification, ownership) live in
/// <see cref="Services.ListingService"/>; limits here are placeholders sized for the first slice.
/// </summary>
public static partial class ListingValidator
{
    public const int MaxNameLength = 120;
    public const int MaxDescriptionLength = 1000;
    public const int MaxCategoryLength = 50;
    public const int MaxPriceCents = 10_000_000; // $100,000.00
    public const int MaxModifiers = 20;
    public const int MaxFlags = 20;
    public const int MaxFlagLength = 40;

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,63}$")]
    private static partial Regex IdPattern();

    /// <param name="allergenIds">The allergen ids a vendor may use (the tag registry, ADR-0022). Allergen flags are a closed list.</param>
    public static Dictionary<string, string[]> Validate(ListingRequest request, bool statusRequired, IReadOnlyList<string> allergenIds)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = new List<string>();
            list.Add(message);
        }

        var name = request.Name?.Trim();
        if (string.IsNullOrEmpty(name)) Add("name", "Name is required.");
        else if (name.Length > MaxNameLength) Add("name", $"Name must be at most {MaxNameLength} characters.");

        if (request.Description is { Length: > MaxDescriptionLength })
            Add("description", $"Description must be at most {MaxDescriptionLength} characters.");

        var category = request.Category?.Trim();
        if (string.IsNullOrEmpty(category)) Add("category", "Category is required.");
        else if (category.Length > MaxCategoryLength) Add("category", $"Category must be at most {MaxCategoryLength} characters.");

        if (request.PriceCents is null) Add("priceCents", "Price is required.");
        else if (request.PriceCents < 0 || request.PriceCents > MaxPriceCents)
            Add("priceCents", $"Price must be between 0 and {MaxPriceCents} cents.");

        if (request.Modifiers is { Count: > MaxModifiers }) Add("modifiers", $"At most {MaxModifiers} modifiers.");
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < (request.Modifiers?.Count ?? 0); i++)
        {
            var m = request.Modifiers![i];
            var key = $"modifiers[{i}]";
            if (m is null) { Add(key, "Modifier is required."); continue; }
            if (string.IsNullOrEmpty(m.Id) || !IdPattern().IsMatch(m.Id))
                Add($"{key}.id", "Modifier id must be lowercase letters, digits and hyphens (max 64).");
            else if (!seen.Add(m.Id)) Add($"{key}.id", "Modifier ids must be unique within a listing.");
            if (string.IsNullOrWhiteSpace(m.Name) || m.Name.Trim().Length > MaxNameLength)
                Add($"{key}.name", $"Modifier name is required (max {MaxNameLength}).");
            if (m.PriceDeltaCents is null || m.PriceDeltaCents < 0 || m.PriceDeltaCents > MaxPriceCents)
                Add($"{key}.priceDeltaCents", $"Modifier price delta must be between 0 and {MaxPriceCents} cents.");
            ValidateFlags($"{key}.allergens", m.Allergens, Add);
            ValidateAllergens($"{key}.allergens", m.Allergens, allergenIds, Add);
        }

        ValidateFlags("allergenFlags", request.AllergenFlags, Add);
        ValidateAllergens("allergenFlags", request.AllergenFlags, allergenIds, Add);
        ValidateStock(request.Stock, Add);

        if (request.Status is null) { if (statusRequired) Add("status", "Status is required."); }
        else if (!ListingStatuses.IsValid(request.Status))
            Add("status", $"Status must be '{ListingStatuses.Draft}' or '{ListingStatuses.Published}'.");

        return errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
    }

    /// <summary>Validation for the optional stock block and for an adjustment (ADR-0017).</summary>
    public static Dictionary<string, string[]> ValidateAdjust(StockAdjustRequest? request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request?.Delta is null) errors["delta"] = ["Delta is required."];
        else if (request.Delta == 0) errors["delta"] = ["Delta cannot be zero."];
        else if (Math.Abs((long)request.Delta.Value) > StockPolicy.MaxQuantity)
            errors["delta"] = [$"Delta must be between -{StockPolicy.MaxQuantity} and {StockPolicy.MaxQuantity}."];
        return errors;
    }

    private static void ValidateStock(StockRequest? stock, Action<string, string> add)
    {
        if (stock is null) return;
        if (stock.AvailableQuantity is < 0 or > StockPolicy.MaxQuantity)
            add("stock.availableQuantity", $"Quantity must be between 0 and {StockPolicy.MaxQuantity}, or omitted for made to order.");
        if (stock.MaxPerOrder is < 1 or > StockPolicy.MaxQuantity)
            add("stock.maxPerOrder", $"Max per order must be between 1 and {StockPolicy.MaxQuantity}.");
        if (stock.LowStockThreshold is < 0 or > StockPolicy.MaxQuantity)
            add("stock.lowStockThreshold", $"Low-stock threshold must be between 0 and {StockPolicy.MaxQuantity}.");
    }

    /// <summary>Allergen/flag text is trimmed, lower-cased and de-duplicated so filtering and display agree.</summary>
    public static List<string> NormalizeFlags(IEnumerable<string>? flags) =>
        (flags ?? Enumerable.Empty<string>())
            .Select(f => f.Trim().ToLowerInvariant())
            .Where(f => f.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    /// <summary>
    /// Allergens are a closed list: every value, once trimmed and lower-cased as it will be stored, must be an allergen id of the registry. A value
    /// that is not one is named, with the ids that are allowed, so a vendor can correct it ("nuts" and "tree nuts" would never match "tree-nut").
    /// Values that already failed the structural check are not reported twice.
    /// </summary>
    private static void ValidateAllergens(string field, List<string>? flags, IReadOnlyList<string> allowed, Action<string, string> add)
    {
        if (flags is null) return;
        var known = new HashSet<string>(allowed, StringComparer.Ordinal);
        foreach (var value in NormalizeFlags(flags.Where(f => f is not null && f.Trim().Length is > 0 and <= MaxFlagLength)).Where(v => !known.Contains(v)))
            add(field, $"'{value}' is not a known allergen. Use one of: {string.Join(", ", allowed)}.");
    }

    private static void ValidateFlags(string field, List<string>? flags, Action<string, string> add)
    {
        if (flags is null) return;
        if (flags.Count > MaxFlags) add(field, $"At most {MaxFlags} entries.");
        if (flags.Any(f => f is null || f.Trim().Length == 0 || f.Trim().Length > MaxFlagLength))
            add(field, $"Entries must be non-empty and at most {MaxFlagLength} characters.");
    }
}
