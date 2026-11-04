namespace CatalogService.Tags;

/// <summary>
/// The tags a public browse may be narrowed by (WI-TAG-003, ADR-0022 decision 6). Only a tag that is public, not retired and inside its window today may be
/// used, and every other id is refused with the same words, so the endpoint cannot be used to find out whether a hidden or retired tag exists. An allergen id is
/// refused too (with the same words): allergens live in their own fields, not in a listing's tags, so a filter on one would match nothing and read as "no listing
/// contains it", which the product must never say.
/// </summary>
public static class TagFilter
{
    public const string RefusalMessage = "That is not a tag you can filter by.";

    /// <summary>
    /// The distinct ids to filter by, or the field problems. A listing must carry all of the ids (see <see cref="Matches"/>). More than
    /// <see cref="TagOptions.MaxFilterTags"/> ids is refused before the registry is consulted.
    /// </summary>
    public static (IReadOnlyList<string> Ids, Dictionary<string, string[]> Errors) Parse(
        IEnumerable<string>? requested, ITagRegistry registry, TimeProvider time, TagOptions limits)
    {
        var errors = new Dictionary<string, string[]>();
        var raw = (requested ?? []).ToList();
        if (raw.Count > limits.MaxFilterTags)
        {
            errors["tag"] = [$"At most {limits.MaxFilterTags} tags to filter by."];
            return ([], errors);
        }

        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        var ids = new List<string>();
        for (var i = 0; i < raw.Count; i++)
        {
            var id = raw[i]?.Trim().ToLowerInvariant() ?? "";
            if (registry.Find(id) is { } tag && tag.Kind != TagKind.Allergen && tag.IsPublicOn(today))
            {
                if (!ids.Contains(id, StringComparer.Ordinal)) ids.Add(id);
            }
            else
            {
                errors[$"tag[{i}]"] = [RefusalMessage];
            }
        }
        return (ids, errors);
    }

    /// <summary>Whether the listing itself carries every one of <paramref name="ids"/> (the vendor's tags or the platform's). A tag on an option does not select the listing.</summary>
    public static bool Matches(Domain.ListingDocument listing, IReadOnlyList<string> ids) =>
        ids.All(id => (listing.Tags?.Contains(id) ?? false) || (listing.PlatformTags?.Contains(id) ?? false));
}
