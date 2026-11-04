using CatalogService.Domain;
using CatalogService.Tags;

namespace CatalogService.Preferences;

/// <summary>
/// How a listing stands against one diet the customer prefers (WI-TAG-004). <see cref="Marked"/> is whether the bakery has marked the listing, as configured, for
/// the diet. <see cref="ItemMarked"/> is whether the listing itself carries the tag. <see cref="OptionIdsNotMarked"/> are the options (all of them for browse and
/// detail, only the chosen ones for a cart) that do not carry it. This is the vendor's claim and never a finding: "not marked" is not "not vegan".
/// </summary>
public sealed record DietMatch(string TagId, bool Marked, bool ItemMarked, IReadOnlyList<string> OptionIdsNotMarked);

/// <summary>
/// The composition rule for a diet claim (ADR-0022 amendment 2026-11-04, WI-TAG-004): a configured item is marked for a diet only if the item has the tag AND every
/// chosen option has it too. It fails safe: a tag a vendor forgot means "not marked", never a false claim. For browse and detail no options are chosen yet, so the
/// listing is marked when the item is, and the options that would remove the claim are listed so the screen can say so.
/// Only a diet the registry shows today counts (public, not retired, inside its window); a preferred diet that has since gone is simply not reported.
/// </summary>
public static class DietMatcher
{
    public static IReadOnlyList<DietMatch> For(
        ListingDocument listing, PreferenceProfile profile, ITagRegistry registry, DateOnly today, IReadOnlyCollection<string>? chosenOptionIds = null)
    {
        if (profile.Prefer.Count == 0) return [];

        var matches = new List<DietMatch>();
        foreach (var id in profile.Prefer.Distinct(StringComparer.Ordinal))
        {
            if (registry.Find(id) is not { Kind: TagKind.Diet } tag || !tag.IsPublicOn(today)) continue;

            var itemMarked = Carries(listing.Tags, listing.PlatformTags, id);
            var notMarked = listing.Modifiers
                .Where(m => chosenOptionIds is null || chosenOptionIds.Contains(m.Id))
                .Where(m => !Carries(m.Tags, m.PlatformTags, id))
                .Select(m => m.Id)
                .ToList();
            var marked = itemMarked && (chosenOptionIds is null || notMarked.Count == 0);
            matches.Add(new DietMatch(id, marked, itemMarked, notMarked));
        }
        return matches;
    }

    private static bool Carries(List<string>? vendor, List<string>? platform, string id) =>
        (vendor?.Contains(id) ?? false) || (platform?.Contains(id) ?? false);
}
