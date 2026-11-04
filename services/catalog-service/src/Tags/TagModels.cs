namespace CatalogService.Tags;

/// <summary>
/// What a tag means (ADR-0022). A closed set in code, because a kind decides the wording the product may use: an <see cref="Allergen"/> tag is a
/// warning (absence means unknown, never safe), a <see cref="Diet"/> tag is the vendor's claim (absence means not marked), the others describe.
/// Adding a kind is a change to ADR-0022.
/// </summary>
public enum TagKind { Allergen, Diet, Occasion, Season, Theme }

public enum TagVisibility { Public, Hidden }

public enum TagAssigner { Vendor, Platform }

/// <summary>
/// One entry of the tag registry. The <see cref="Id"/> is the contract between services, the BFF and the browser (a slug that is never renamed or
/// reused; a tag that is no longer offered is <see cref="Retired"/>, not deleted); the <see cref="Label"/> is for display and may change.
/// </summary>
public sealed record TagDefinition(
    string Id,
    TagKind Kind,
    string Label,
    TagVisibility Visibility = TagVisibility.Public,
    TagAssigner AssignableBy = TagAssigner.Vendor,
    DateOnly? ActiveFrom = null,
    DateOnly? ActiveTo = null,
    int SortOrder = 0,
    bool Retired = false)
{
    /// <summary>
    /// Whether the tag may appear in a public response on <paramref name="today"/> (UTC): public, not retired, and inside its window when it has
    /// one (both ends inclusive). The catalog decides this, never the screen (ADR-0022 decision 6).
    /// </summary>
    public bool IsPublicOn(DateOnly today) =>
        Visibility == TagVisibility.Public && !Retired
        && (ActiveFrom is null || today >= ActiveFrom) && (ActiveTo is null || today <= ActiveTo);

    /// <summary>Whether a vendor may put the tag on their own listing or option.</summary>
    public bool VendorMayAssign => AssignableBy == TagAssigner.Vendor && !Retired;
}
