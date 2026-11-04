using CatalogService.Domain;

namespace CatalogService.Preferences;

/// <summary>
/// One allergen of a customer's profile found on a listing (WI-SRCH-001). <see cref="Severity"/> is <c>allergy</c> or <c>avoid</c>; <see cref="Source"/> is
/// <c>item</c> (the listing itself contains it) or <c>option</c> (only the options in <see cref="OptionIds"/> do; empty for an item conflict).
/// </summary>
public sealed record Conflict(string AllergenId, string Severity, string Source, IReadOnlyList<string> OptionIds);

/// <summary>
/// The rule that decides whether something conflicts with a customer's profile. It lives in the catalog and the BFF only maps it (ADR-0013).
/// Exact match on allergen ids from the closed list (ADR-0022). Silence is never an answer: no conflict means "none of your listed allergens is
/// marked", and the product must not word it as safe, because a vendor's flags may be incomplete or, on a listing stored before the list was
/// closed, may not be ids at all (those can never match).
/// </summary>
public static class ConflictMatcher
{
    public const string Allergy = "allergy";
    public const string Avoid = "avoid";
    public const string Item = "item";
    public const string Option = "option";

    /// <summary>
    /// The conflicts of <paramref name="listing"/> with <paramref name="profile"/>. With <paramref name="chosenOptionIds"/> null every option counts
    /// (browse and detail show what a listing can contain); with a set only the options chosen count (a cart). The result is in a stable order:
    /// allergies before avoids, then by allergen id, then the item before its options.
    /// </summary>
    public static IReadOnlyList<Conflict> For(ListingDocument listing, PreferenceProfile profile, IReadOnlyCollection<string>? chosenOptionIds = null)
    {
        var severity = SeverityMap(profile);
        if (severity.Count == 0) return [];

        var found = new List<Conflict>();
        foreach (var flag in listing.AllergenFlags.Distinct(StringComparer.Ordinal))
        {
            if (severity.TryGetValue(flag, out var s)) found.Add(new Conflict(flag, s, Item, []));
        }

        var byAllergen = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var option in listing.Modifiers.Where(m => chosenOptionIds is null || chosenOptionIds.Contains(m.Id)))
        {
            foreach (var allergen in option.Allergens.Distinct(StringComparer.Ordinal).Where(severity.ContainsKey))
            {
                if (!byAllergen.TryGetValue(allergen, out var ids)) byAllergen[allergen] = ids = [];
                ids.Add(option.Id);
            }
        }
        found.AddRange(byAllergen.Select(e => new Conflict(e.Key, severity[e.Key], Option, e.Value)));

        return found
            .OrderBy(c => c.Severity == Allergy ? 0 : 1)
            .ThenBy(c => c.AllergenId, StringComparer.Ordinal)
            .ThenBy(c => c.Source == Item ? 0 : 1)
            .ToList();
    }

    /// <summary>Whether the listing itself (not only an optional add-on) contains an allergen of the profile. This is what "hide conflicts" removes.</summary>
    public static bool ItemConflicts(ListingDocument listing, PreferenceProfile profile)
    {
        var severity = SeverityMap(profile);
        return severity.Count > 0 && listing.AllergenFlags.Any(severity.ContainsKey);
    }

    private static Dictionary<string, string> SeverityMap(PreferenceProfile profile)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var id in profile.Avoid) map[id] = Avoid;
        foreach (var id in profile.Allergies) map[id] = Allergy; // an allergen in both (the profile refuses that) is the serious one
        return map;
    }
}
