namespace CatalogService.Tags;

/// <summary>
/// The limits on how many tags a vendor may put on a listing and on an option (ADR-0022, WI-TAG-002). Decided 2026-11-04: they are
/// easy to adjust: this is the one place they live, bound from the <c>Tags</c> configuration section, and the validator, the tests and every message take
/// them from here instead of repeating the numbers.
/// </summary>
public sealed class TagOptions
{
    public const int DefaultMaxPerListing = 12;
    public const int DefaultMaxPerOption = 6;

    /// <summary>The most tags a listing may carry (the vendor's own; platform tags do not count against it).</summary>
    public int MaxPerListing { get; set; } = DefaultMaxPerListing;

    /// <summary>The most tags one option may carry.</summary>
    public int MaxPerOption { get; set; } = DefaultMaxPerOption;

    /// <summary>The most tags a public browse may be narrowed by at once (WI-TAG-003).</summary>
    public int MaxFilterTags { get; set; } = 10;
}

/// <summary>A tag on a listing or an option as a response shows it. <see cref="Active"/> is only sent to the owning vendor, who also sees tags that are not showing today.</summary>
public sealed record ListingTagDto(
    string Id,
    string Kind,
    string Label,
    int SortOrder,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    bool? Active = null);

/// <summary>
/// Which tags a response may show (ADR-0022 decision 6). The catalog decides, never the screen: a public response carries only tags that are public, not
/// retired and inside their window today (UTC, by the catalog's own clock), whoever put them there; the owning vendor sees the tags they assigned, with the
/// ones that are not showing marked inactive. Platform tags (<c>platformTags</c>) are never shown to a vendor, which keeps what a vendor cannot change
/// out of what they edit.
/// </summary>
public sealed class TagProjector(ITagRegistry registry, TimeProvider time)
{
    private DateOnly Today => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);

    /// <summary>The tags a public response may carry: the vendor's and the platform's, active today, in registry order.</summary>
    public IReadOnlyList<ListingTagDto> Public(IEnumerable<string>? vendorTags, IEnumerable<string>? platformTags)
    {
        var today = Today;
        return (vendorTags ?? []).Concat(platformTags ?? [])
            .Distinct(StringComparer.Ordinal)
            .Select(registry.Find)
            .OfType<TagDefinition>()
            .Where(t => t.IsPublicOn(today))
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Id, StringComparer.Ordinal)
            .Select(t => new ListingTagDto(t.Id, t.Kind.ToString().ToLowerInvariant(), t.Label, t.SortOrder))
            .ToList();
    }

    /// <summary>The owning vendor's own tags, in the order they were assigned, each marked active or not; an id the registry no longer has is shown as itself, inactive.</summary>
    public IReadOnlyList<ListingTagDto> Owner(IEnumerable<string>? vendorTags)
    {
        var today = Today;
        return (vendorTags ?? []).Distinct(StringComparer.Ordinal).Select(id =>
            registry.Find(id) is { } t
                ? new ListingTagDto(t.Id, t.Kind.ToString().ToLowerInvariant(), t.Label, t.SortOrder, t.IsPublicOn(today))
                : new ListingTagDto(id, "unknown", id, int.MaxValue, false)).ToList();
    }
}
