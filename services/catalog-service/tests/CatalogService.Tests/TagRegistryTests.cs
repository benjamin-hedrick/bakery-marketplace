using CatalogService.Tags;

namespace CatalogService.Tests;

/// <summary>WI-TAG-001: the registry file is validated when it is loaded, and a tag is public only inside its window (ADR-0022).</summary>
public sealed class TagRegistryTests
{
    private static string File(params string[] entries) => $"{{ \"tags\": [ {string.Join(", ", entries)} ] }}";

    private static string Tag(string id, string kind = "allergen", string extra = "") =>
        $"{{ \"id\": \"{id}\", \"kind\": \"{kind}\", \"label\": \"Label {id}\"{(extra.Length > 0 ? ", " + extra : "")} }}";

    [Fact]
    public void The_registry_that_ships_loads_and_holds_the_nine_allergens_a_vendor_may_use()
    {
        var registry = TagRegistry.LoadEmbedded();

        Assert.Equal(
            ["dairy", "egg", "fish", "shellfish", "tree-nut", "peanut", "gluten", "soy", "sesame"],
            registry.VendorAllergenIds);
        Assert.All(registry.All, t => Assert.Equal(TagKind.Allergen, t.Kind));
    }

    [Theory]
    [InlineData("Tree-Nut")]
    [InlineData("tree nut")]
    [InlineData("-leading")]
    [InlineData("under_score")]
    [InlineData("")]
    public void An_id_that_is_not_a_slug_is_refused_and_named(string id)
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(Tag(id))));

        Assert.Contains($"Tag '{id}'", e.Message);
    }

    [Fact]
    public void An_id_longer_than_forty_characters_is_refused()
    {
        var id = new string('a', 41);

        Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(Tag(id))));
        TagRegistry.Parse(File(Tag(new string('a', 40)))); // forty is fine
    }

    [Fact]
    public void An_id_is_unique_across_all_kinds()
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(Tag("vegan", "diet"), Tag("vegan", "theme"))));

        Assert.Contains("Tag 'vegan'", e.Message);
        Assert.Contains("more than once", e.Message);
    }

    [Fact]
    public void A_kind_outside_the_closed_set_is_refused()
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(Tag("vegan", "cuisine"))));

        Assert.Contains("not valid", e.Message);
    }

    [Fact]
    public void A_missing_kind_or_label_is_refused_not_defaulted()
    {
        var noKind = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File("{ \"id\": \"x\", \"label\": \"X\" }")));
        var noLabel = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File("{ \"id\": \"x\", \"kind\": \"theme\" }")));

        Assert.Contains("kind is required", noKind.Message);
        Assert.Contains("label is required", noLabel.Message);
    }

    [Fact]
    public void A_window_that_ends_before_it_starts_is_refused()
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(
            Tag("thanksgiving", "occasion", "\"activeFrom\": \"2026-11-28\", \"activeTo\": \"2026-11-01\""))));

        Assert.Contains("Tag 'thanksgiving'", e.Message);
        Assert.Contains("activeFrom is after activeTo", e.Message);
    }

    [Fact]
    public void A_hidden_tag_must_be_platform_assigned()
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(Tag("staff-pick", "theme", "\"visibility\": \"hidden\""))));
        TagRegistry.Parse(File(Tag("staff-pick", "theme", "\"visibility\": \"hidden\", \"assignableBy\": \"platform\""))); // allowed

        Assert.Contains("hidden tag must be assignableBy platform", e.Message);
    }

    [Fact]
    public void A_misspelt_field_is_refused_so_a_typo_cannot_silently_make_a_tag_public()
    {
        var e = Assert.Throws<TagRegistryException>(() => TagRegistry.Parse(File(
            Tag("staff-pick", "theme", "\"visibilty\": \"hidden\", \"assignableBy\": \"platform\""))));

        Assert.Contains("not valid", e.Message);
    }

    [Fact]
    public void A_file_that_is_not_json_or_has_no_list_is_refused()
    {
        Assert.Throws<TagRegistryException>(() => TagRegistry.Parse("not json"));
        Assert.Throws<TagRegistryException>(() => TagRegistry.Parse("{}"));
    }

    [Fact]
    public void Public_means_public_not_retired_and_inside_the_window_with_both_ends_included()
    {
        var registry = TagRegistry.Parse(File(
            Tag("always", "theme"),
            Tag("hidden-one", "theme", "\"visibility\": \"hidden\", \"assignableBy\": \"platform\""),
            Tag("gone", "theme", "\"retired\": true"),
            Tag("thanksgiving", "occasion", "\"activeFrom\": \"2026-11-01\", \"activeTo\": \"2026-11-28\""),
            Tag("from-only", "season", "\"activeFrom\": \"2026-12-01\"")));
        string[] On(string date) => registry.PublicOn(DateOnly.Parse(date)).Select(t => t.Id).Order().ToArray();

        Assert.Equal(["always"], On("2026-10-31"));
        Assert.Equal(["always", "thanksgiving"], On("2026-11-01"));  // first day is in
        Assert.Equal(["always", "thanksgiving"], On("2026-11-28"));  // last day is in
        Assert.Equal(["always"], On("2026-11-29"));
        Assert.Equal(["always", "from-only"], On("2026-12-01"));     // open-ended window
        Assert.Equal(["always", "from-only"], On("2030-01-01"));
    }

    [Fact]
    public void Only_a_vendor_assignable_not_retired_allergen_is_an_allowed_allergen_id()
    {
        var registry = TagRegistry.Parse(File(
            Tag("dairy"),
            Tag("old-allergen", "allergen", "\"retired\": true"),
            Tag("platform-allergen", "allergen", "\"assignableBy\": \"platform\""),
            Tag("vegan", "diet")));

        Assert.Equal(["dairy"], registry.VendorAllergenIds);
    }

    [Fact]
    public void The_registry_is_in_sort_order_then_id_and_a_tag_can_be_found_by_id()
    {
        var registry = TagRegistry.Parse(File(Tag("b", "theme", "\"sortOrder\": 2"), Tag("c", "theme", "\"sortOrder\": 1"), Tag("a", "theme", "\"sortOrder\": 2")));

        Assert.Equal(["c", "a", "b"], registry.All.Select(t => t.Id));
        Assert.Equal("Label a", registry.Find("a")!.Label);
        Assert.Null(registry.Find("zzz"));
    }
}
