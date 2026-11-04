using CatalogService.Domain;
using CatalogService.Preferences;

namespace CatalogService.Tests;

/// <summary>WI-SRCH-001: the rule that decides what in a listing conflicts with a customer's profile. Pure, so every case is exact.</summary>
public sealed class ConflictMatcherTests
{
    private static ListingDocument Listing(string[]? flags = null, params (string Id, string[] Allergens)[] options) => new()
    {
        Id = "listing-x",
        VendorId = "vendor-x",
        AllergenFlags = (flags ?? []).ToList(),
        Modifiers = options.Select(o => new ModifierDocument { Id = o.Id, Name = o.Id, Allergens = o.Allergens.ToList() }).ToList(),
    };

    private static PreferenceProfile Profile(string[]? allergies = null, string[]? avoid = null) =>
        new(allergies ?? [], avoid ?? [], null);

    /// <summary>A conflict as text, because records compare their lists by reference.</summary>
    private static string[] Shape(IEnumerable<Conflict> conflicts) =>
        conflicts.Select(c => $"{c.AllergenId}:{c.Severity}:{c.Source}:[{string.Join(",", c.OptionIds)}]").ToArray();

    [Fact]
    public void A_flag_on_the_item_is_an_item_conflict_with_the_severity_of_the_list_it_is_in()
    {
        var conflicts = ConflictMatcher.For(Listing(["tree-nut", "dairy", "gluten"]), Profile(["tree-nut"], ["dairy"]));

        Assert.Equal(["tree-nut:allergy:item:[]", "dairy:avoid:item:[]"], Shape(conflicts));
    }

    [Fact]
    public void An_allergen_only_an_option_contains_is_an_option_conflict_naming_the_options()
    {
        var listing = Listing(["gluten"], ("mod-seeds", ["sesame"]), ("mod-poppy", ["sesame"]), ("mod-sliced", []));

        var conflicts = ConflictMatcher.For(listing, Profile(["sesame"]));

        Assert.Equal(["sesame:allergy:option:[mod-seeds,mod-poppy]"], Shape(conflicts));
    }

    [Fact]
    public void With_chosen_options_only_the_chosen_ones_count()
    {
        var listing = Listing([], ("mod-almonds", ["tree-nut"]), ("mod-seeds", ["sesame"]));
        var profile = Profile(["tree-nut", "sesame"]);

        Assert.Equal(2, ConflictMatcher.For(listing, profile).Count);                                   // browse: what it can contain
        Assert.Equal(["sesame:allergy:option:[mod-seeds]"], Shape(ConflictMatcher.For(listing, profile, ["mod-seeds"])));
        Assert.Empty(ConflictMatcher.For(listing, profile, []));                                        // a cart line with no options
        Assert.Empty(ConflictMatcher.For(listing, profile, ["mod-unknown"]));
    }

    [Fact]
    public void The_item_conflict_stays_whatever_options_are_chosen()
    {
        var listing = Listing(["tree-nut"], ("mod-almonds", ["tree-nut"]));

        var none = ConflictMatcher.For(listing, Profile(["tree-nut"]), []);
        var both = ConflictMatcher.For(listing, Profile(["tree-nut"]), ["mod-almonds"]);

        Assert.Equal(["tree-nut:allergy:item:[]"], Shape(none));
        Assert.Equal(["tree-nut:allergy:item:[]", "tree-nut:allergy:option:[mod-almonds]"], Shape(both));
    }

    [Fact]
    public void An_allergen_in_both_lists_is_treated_as_the_serious_one()
    {
        var conflicts = ConflictMatcher.For(Listing(["dairy"]), Profile(["dairy"], ["dairy"]));

        Assert.Equal(["dairy:allergy:item:[]"], Shape(conflicts));
    }

    [Fact]
    public void The_order_is_allergies_first_then_allergen_id_then_item_before_option()
    {
        var listing = Listing(["soy", "dairy", "egg"], ("o1", ["egg", "peanut"]));

        var conflicts = ConflictMatcher.For(listing, Profile(["soy", "peanut"], ["egg", "dairy"]));

        Assert.Equal(
            ["peanut:allergy:option", "soy:allergy:item", "dairy:avoid:item", "egg:avoid:item", "egg:avoid:option"],
            conflicts.Select(c => $"{c.AllergenId}:{c.Severity}:{c.Source}"));
    }

    [Fact]
    public void An_empty_profile_or_a_listing_with_nothing_marked_has_no_conflicts()
    {
        Assert.Empty(ConflictMatcher.For(Listing(["tree-nut"], ("o", ["sesame"])), Profile()));
        Assert.Empty(ConflictMatcher.For(Listing(), Profile(["tree-nut"], ["dairy"])));
    }

    [Fact]
    public void Matching_is_by_exact_id_so_a_value_that_is_not_an_id_never_matches()
    {
        // A listing stored before the allergen list was closed can hold anything. It cannot be matched, and it must not be guessed at.
        var listing = Listing(["tree nuts", "Tree-Nut", "nuts"], ("o", ["TREE-NUT"]));

        Assert.Empty(ConflictMatcher.For(listing, Profile(["tree-nut"])));
    }

    [Fact]
    public void A_flag_repeated_on_the_item_or_an_option_is_one_conflict()
    {
        var listing = Listing(["sesame", "sesame"], ("o", ["sesame", "sesame"]));

        var conflicts = ConflictMatcher.For(listing, Profile(["sesame"]));

        Assert.Equal(2, conflicts.Count); // one for the item, one for the option
    }

    [Fact]
    public void Hiding_looks_at_the_item_only_and_at_both_severities()
    {
        var viaOption = Listing([], ("o", ["tree-nut"]));
        var viaItem = Listing(["dairy"]);

        Assert.False(ConflictMatcher.ItemConflicts(viaOption, Profile(["tree-nut"])));
        Assert.True(ConflictMatcher.ItemConflicts(viaItem, Profile(avoid: ["dairy"])));
        Assert.True(ConflictMatcher.ItemConflicts(viaItem, Profile(["dairy"])));
        Assert.False(ConflictMatcher.ItemConflicts(viaItem, Profile()));
    }
}
