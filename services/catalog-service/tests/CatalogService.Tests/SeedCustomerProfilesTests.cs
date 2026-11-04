using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Seed;
using CatalogService.Domain;
using CatalogService.Preferences;

namespace CatalogService.Tests;

/// <summary>
/// WI-MOB-002: customers with a saved allergen profile are SEED DATA (tools/BakeryMarketplace.Seed), not something a test sets at run time. These tests keep the
/// fixtures honest: they exist, they are written once, they match the mock identities, and each one produces the conflict case it is there to demonstrate under
/// the catalog's real rules (<see cref="ConflictMatcher"/>).
/// </summary>
public sealed class SeedCustomerProfilesTests
{
    private readonly FakeRepository<ListingDocument> _listings = new(d => d.Id);
    private readonly FakeRepository<PreferenceProfileDocument> _profiles = new(d => d.Id);
    private readonly InMemoryEventTransport _transport = new();

    private Seeder NewSeeder() => new(_listings, _transport, _profiles);

    private static PreferenceProfile AsProfile(PreferenceProfileDocument d) => new(d.Allergies, d.Avoid, d.UpdatedAt, d.Prefer);

    private static PreferenceProfileDocument Seeded(string customerId) =>
        SeedData.CustomerProfiles().Single(p => p.CustomerId == customerId);

    private static ListingDocument Listing(string id) => SeedData.Listings().Single(l => l.Id == id);

    [Fact]
    public async Task Seeding_writes_each_customers_saved_profile_under_the_customers_id()
    {
        var result = await NewSeeder().SeedAsync();

        Assert.Equal(4, result.ProfilesCreated);
        foreach (var expected in SeedData.CustomerProfiles())
        {
            var stored = await _profiles.GetAsync(expected.CustomerId, expected.CustomerId);
            Assert.NotNull(stored);
            Assert.Equal(expected.CustomerId, stored.Id); // one profile per customer: the id is the customer id (ADR-0004)
            Assert.Equal(expected.Allergies, stored.Allergies);
            Assert.Equal(expected.Avoid, stored.Avoid);
        }
    }

    [Fact]
    public async Task Seeding_again_changes_nothing_and_keeps_a_profile_changed_in_between()
    {
        await NewSeeder().SeedAsync();
        var changed = await _profiles.GetAsync(SeedData.TreeNutAllergyCustomerId, SeedData.TreeNutAllergyCustomerId);
        changed!.Allergies = ["peanut"];
        await _profiles.SaveAsync(changed, changed.CustomerId);

        var again = await NewSeeder().SeedAsync();

        Assert.Equal(0, again.ProfilesCreated);
        Assert.Equal(4, again.ProfilesUnchanged);
        var kept = await _profiles.GetAsync(SeedData.TreeNutAllergyCustomerId, SeedData.TreeNutAllergyCustomerId);
        Assert.Equal(["peanut"], kept!.Allergies); // a developer's local edit survives, as for listings
    }

    [Fact]
    public async Task A_seeder_given_no_profile_store_seeds_no_profiles()
    {
        var result = await new Seeder(_listings, _transport).SeedAsync();

        Assert.Equal(0, result.ProfilesCreated);
        Assert.Equal(0, result.ProfilesUnchanged);
        Assert.True(result.ListingsCreated > 0);
    }

    [Fact]
    public void Every_seeded_profile_belongs_to_a_mock_customer_and_every_mock_customer_but_alice_has_one()
    {
        var mockCustomers = MockUsers.All.Values.Where(u => u.Role == "Customer").Select(u => u.Id).Distinct().ToHashSet();
        var seeded = SeedData.CustomerProfiles().Select(p => p.CustomerId).ToList();

        Assert.Equal(seeded.Count, seeded.Distinct().Count()); // no customer twice
        Assert.True(seeded.All(mockCustomers.Contains), "a seeded profile has no matching mock identity");
        Assert.Equal(mockCustomers.Except([MockUsers.Customer.Id]).Order(), seeded.Order());
        Assert.DoesNotContain(MockUsers.Customer.Id, seeded); // Alice is the customer who never saved a profile
    }

    [Fact]
    public void The_names_the_login_page_shows_say_what_each_saved_profile_is()
    {
        Assert.Contains("tree-nut", MockUsers.TreeNutAllergyCustomer.Name);
        Assert.Contains("sesame", MockUsers.SesameAllergyCustomer.Name);
        Assert.Contains("dairy", MockUsers.AvoidsDairyCustomer.Name);
        Assert.Contains("gluten", MockUsers.SeveralCustomer.Name);
        // ids are what a token's sub carries and what the profile is keyed by
        Assert.Equal(SeedData.TreeNutAllergyCustomerId, MockUsers.TreeNutAllergyCustomer.Id);
        Assert.Equal(SeedData.SesameAllergyCustomerId, MockUsers.SesameAllergyCustomer.Id);
        Assert.Equal(SeedData.AvoidsDairyCustomerId, MockUsers.AvoidsDairyCustomer.Id);
        Assert.Equal(SeedData.SeveralCustomerId, MockUsers.SeveralCustomer.Id);
    }

    // ---- each fixture produces the case it is there for ----------------------------------------------------------------------------

    [Fact]
    public void Tree_nut_allergy_conflicts_with_the_croissant_itself_and_with_its_extra_almonds_option()
    {
        var profile = AsProfile(Seeded(SeedData.TreeNutAllergyCustomerId));
        var croissant = Listing("listing-croissant-001");

        var plain = ConflictMatcher.For(croissant, profile, []);
        var withAlmonds = ConflictMatcher.For(croissant, profile, ["mod-extra-almond"]);

        Assert.Equal([("tree-nut", ConflictMatcher.Allergy, ConflictMatcher.Item)], plain.Select(c => (c.AllergenId, c.Severity, c.Source)));
        Assert.Equal(
            [("tree-nut", ConflictMatcher.Allergy, ConflictMatcher.Item), ("tree-nut", ConflictMatcher.Allergy, ConflictMatcher.Option)],
            withAlmonds.Select(c => (c.AllergenId, c.Severity, c.Source)));
    }

    [Fact]
    public void Sesame_allergy_conflicts_only_through_an_option_so_the_sourdough_is_clean_until_seeds_are_added()
    {
        var profile = AsProfile(Seeded(SeedData.SesameAllergyCustomerId));
        var sourdough = Listing("listing-sourdough-001");

        Assert.Empty(ConflictMatcher.For(sourdough, profile, []));
        Assert.Empty(ConflictMatcher.For(sourdough, profile, ["mod-sliced"]));
        var withSeeds = ConflictMatcher.For(sourdough, profile, ["mod-seeds"]);
        var only = Assert.Single(withSeeds);
        Assert.Equal(("sesame", ConflictMatcher.Allergy, ConflictMatcher.Option), (only.AllergenId, only.Severity, only.Source));
        Assert.Equal(["mod-seeds"], only.OptionIds);
        Assert.False(ConflictMatcher.ItemConflicts(sourdough, profile)); // an option alone never hides the item
    }

    [Fact]
    public void Avoiding_dairy_is_a_preference_only_so_there_is_no_serious_conflict_to_acknowledge()
    {
        var profile = AsProfile(Seeded(SeedData.AvoidsDairyCustomerId));

        var conflicts = ConflictMatcher.For(Listing("listing-croissant-001"), profile, []);

        var only = Assert.Single(conflicts);
        Assert.Equal(("dairy", ConflictMatcher.Avoid, ConflictMatcher.Item), (only.AllergenId, only.Severity, only.Source));
        Assert.DoesNotContain(conflicts, c => c.Severity == ConflictMatcher.Allergy);
        Assert.Empty(Seeded(SeedData.AvoidsDairyCustomerId).Allergies); // so nothing is offered under "tell the bakery"
    }

    [Fact]
    public void Several_allergies_and_an_avoid_give_serious_conflicts_and_a_preference_on_the_croissant()
    {
        var profile = AsProfile(Seeded(SeedData.SeveralCustomerId));

        var conflicts = ConflictMatcher.For(Listing("listing-croissant-001"), profile, ["mod-extra-almond"]);

        Assert.Equal(
            [
                ("dairy", ConflictMatcher.Allergy, ConflictMatcher.Item),
                ("tree-nut", ConflictMatcher.Allergy, ConflictMatcher.Item),
                ("tree-nut", ConflictMatcher.Allergy, ConflictMatcher.Option),
                ("gluten", ConflictMatcher.Avoid, ConflictMatcher.Item),
            ],
            conflicts.Select(c => (c.AllergenId, c.Severity, c.Source)));
        Assert.Equal(["dairy", "tree-nut"], Seeded(SeedData.SeveralCustomerId).Allergies.Order()); // two allergies to choose between under "tell the bakery"
    }

    [Fact]
    public void Alice_has_no_profile_and_so_no_conflict_with_anything()
    {
        Assert.DoesNotContain(SeedData.CustomerProfiles(), p => p.CustomerId == MockUsers.Customer.Id);
    }
}
