using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CatalogService.Domain;
using CatalogService.Preferences;
using CatalogService.Tags;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>
/// WI-TAG-004: the diets a customer prefers, and the rule that decides whether a configured item is marked for one (ADR-0022 amendment 2026-11-04): the item has
/// the tag AND every chosen option has it too. It is the bakery's claim and fails safe: a forgotten tag is "not marked", never a false claim.
/// </summary>
public sealed class DietMatcherTests
{
    private static readonly ITagRegistry Registry = TagRegistry.Parse("""
        { "tags": [
          { "id": "dairy", "kind": "allergen", "label": "Milk (dairy)" },
          { "id": "vegan", "kind": "diet", "label": "Vegan" },
          { "id": "vegetarian", "kind": "diet", "label": "Vegetarian" },
          { "id": "old-diet", "kind": "diet", "label": "Old", "retired": true },
          { "id": "winter-diet", "kind": "diet", "label": "Winter", "activeFrom": "2026-12-01", "activeTo": "2026-12-31" },
          { "id": "featured", "kind": "theme", "label": "Featured", "assignableBy": "platform" }
        ] }
        """);

    private static readonly DateOnly Today = new(2026, 11, 4);

    private static ListingDocument Listing(string[]? tags, string[]? platform = null, params (string Id, string[]? Tags)[] options) => new()
    {
        Id = "l1",
        VendorId = "v1",
        Name = "Loaf",
        Category = "bread",
        PriceCents = 800,
        Status = ListingStatuses.Published,
        Tags = tags?.ToList(),
        PlatformTags = platform?.ToList(),
        Modifiers = options.Select(o => new ModifierDocument { Id = o.Id, Name = o.Id, Tags = o.Tags?.ToList() }).ToList(),
    };

    private static PreferenceProfile Prefers(params string[] diets) => new([], [], null, diets);

    [Fact]
    public void A_listing_marked_vegan_with_no_options_chosen_is_marked_and_names_the_options_that_would_remove_the_claim()
    {
        var listing = Listing(["vegan"], null, ("seeds", ["vegan"]), ("honey", null), ("sliced", null));

        var match = Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today));

        Assert.Equal(("vegan", true, true), (match.TagId, match.Marked, match.ItemMarked));
        Assert.Equal(["honey", "sliced"], match.OptionIdsNotMarked); // browse and detail: what choosing them would do
    }

    [Fact]
    public void A_chosen_option_that_does_not_carry_the_tag_removes_the_claim()
    {
        var listing = Listing(["vegan"], null, ("seeds", ["vegan"]), ("honey", null));

        var match = Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, ["seeds", "honey"]));

        Assert.False(match.Marked);
        Assert.True(match.ItemMarked);
        Assert.Equal(["honey"], match.OptionIdsNotMarked);
    }

    [Fact]
    public void A_forgotten_tag_on_an_option_is_not_marked_never_a_false_claim()
    {
        var listing = Listing(["vegan"], null, ("sliced", null)); // a neutral option the vendor did not tag

        Assert.False(Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, ["sliced"])).Marked);
    }

    [Fact]
    public void Every_chosen_option_carrying_the_tag_keeps_the_claim_and_an_option_not_chosen_does_not_matter()
    {
        var listing = Listing(["vegan"], null, ("seeds", ["vegan"]), ("honey", null));

        Assert.True(Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, ["seeds"])).Marked);
        Assert.True(Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, [])).Marked); // nothing chosen
    }

    [Fact]
    public void An_item_without_the_tag_is_not_marked_whatever_its_options_say()
    {
        var listing = Listing(["vegetarian"], null, ("seeds", ["vegan"]));

        var match = Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, ["seeds"]));

        Assert.Equal((false, false), (match.Marked, match.ItemMarked));
    }

    [Fact]
    public void The_platforms_tags_count_like_the_vendors()
    {
        var listing = Listing(null, ["vegan"], ("seeds", null));
        listing.Modifiers[0].PlatformTags = ["vegan"];

        Assert.True(Assert.Single(DietMatcher.For(listing, Prefers("vegan"), Registry, Today, ["seeds"])).Marked);
    }

    [Fact]
    public void Each_preferred_diet_is_reported_in_the_order_the_profile_lists_them()
    {
        var listing = Listing(["vegetarian"]);

        var matches = DietMatcher.For(listing, Prefers("vegan", "vegetarian"), Registry, Today);

        Assert.Equal([("vegan", false), ("vegetarian", true)], matches.Select(m => (m.TagId, m.Marked)));
    }

    [Theory]
    [InlineData("old-diet")] // retired
    [InlineData("winter-diet")] // outside its window today
    [InlineData("dairy")] // an allergen is not a diet
    [InlineData("featured")] // not a diet
    [InlineData("no-such-tag")]
    public void A_preferred_id_that_is_not_a_diet_the_registry_shows_today_is_not_reported(string id)
    {
        Assert.Empty(DietMatcher.For(Listing(["old-diet", "winter-diet"]), Prefers(id), Registry, Today));
    }

    [Fact]
    public void A_customer_with_no_preferred_diets_gets_nothing()
    {
        Assert.Empty(DietMatcher.For(Listing(["vegan"]), PreferenceProfile.Empty, Registry, Today));
    }
}

/// <summary>WI-TAG-004 over HTTP: the profile's <c>prefer</c> list, and the diet matches on the personalized listing views and the cart check.</summary>
public sealed class DietPreferenceApiTests : IDisposable
{
    private const string Registry = """
        { "tags": [
          { "id": "dairy", "kind": "allergen", "label": "Milk (dairy)", "sortOrder": 10 },
          { "id": "vegan", "kind": "diet", "label": "Vegan", "sortOrder": 30 },
          { "id": "vegetarian", "kind": "diet", "label": "Vegetarian", "sortOrder": 35 },
          { "id": "staff-pick", "kind": "theme", "label": "Staff pick", "visibility": "hidden", "assignableBy": "platform", "sortOrder": 50 }
        ] }
        """;

    private readonly CatalogFactory _factory = new();
    private readonly WebApplicationFactory<Program> _app;
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";

    public DietPreferenceApiTests()
    {
        _app = _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
        {
            services.RemoveAll<ITagRegistry>();
            services.AddSingleton<ITagRegistry>(TagRegistry.Parse(Registry));
        }));
    }

    public void Dispose()
    {
        _app.Dispose();
        _factory.Dispose();
    }

    private HttpClient Customer(string sub = "customer-1")
    {
        var client = _app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token(sub, "Customer"));
        return client;
    }

    private async Task SeedAsync()
    {
        await _app.Services.GetRequiredService<BakeryMarketplace.Eventing.IEventPublisher>().PublishAsync(
            new BakeryMarketplace.Eventing.DomainEventEnvelope<BakeryMarketplace.EventSchemas.VendorVerifiedPayload>(
                Guid.NewGuid(), "VendorVerified", 1, DateTimeOffset.UtcNow, "Vendor", _vendor, 1, new BakeryMarketplace.EventSchemas.VendorVerifiedPayload(_vendor)));
        var repo = _app.Services.GetRequiredService<BakeryMarketplace.Data.IRepository<ListingDocument>>();
        var now = DateTimeOffset.UtcNow;
        await repo.SaveAsync(new ListingDocument
        {
            Id = "l-loaf",
            VendorId = _vendor,
            Name = "Loaf",
            Category = "bread",
            PriceCents = 800,
            Status = ListingStatuses.Published,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
            Tags = ["vegan"],
            Modifiers =
            [
                new ModifierDocument { Id = "seeds", Name = "Seeds", Tags = ["vegan"] },
                new ModifierDocument { Id = "honey", Name = "Honey" },
            ],
        }, _vendor);
        await repo.SaveAsync(new ListingDocument
        {
            Id = "l-roll",
            VendorId = _vendor,
            Name = "Roll",
            Category = "bread",
            PriceCents = 300,
            Status = ListingStatuses.Published,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
        }, _vendor);
    }

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static string[] Strings(JsonElement array) => array.EnumerateArray().Select(a => a.GetString()!).ToArray();

    // ---- the profile ---------------------------------------------------------------------------------------

    [Fact]
    public async Task The_prefer_list_is_saved_read_back_replaced_and_cleared()
    {
        var client = Customer();

        var saved = await client.PutAsJsonAsync("/catalog/preferences", new { allergies = new[] { "dairy" }, avoid = Array.Empty<string>(), prefer = new[] { "vegan" } });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(["vegan"], Strings((await JsonOf(saved)).GetProperty("prefer")));
        Assert.Equal(["vegan"], Strings((await JsonOf(await client.GetAsync("/catalog/preferences"))).GetProperty("prefer")));

        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { "vegetarian", "vegan" } });
        Assert.Equal(["vegetarian", "vegan"], Strings((await JsonOf(await client.GetAsync("/catalog/preferences"))).GetProperty("prefer")));

        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = Array.Empty<string>() });
        Assert.Empty((await JsonOf(await client.GetAsync("/catalog/preferences"))).GetProperty("prefer").EnumerateArray());
    }

    [Fact]
    public async Task A_save_without_a_prefer_list_leaves_the_stored_one_alone()
    {
        var client = Customer();
        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { "vegan" } });

        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = new[] { "dairy" }, avoid = Array.Empty<string>() });

        var profile = await JsonOf(await client.GetAsync("/catalog/preferences"));
        Assert.Equal(["vegan"], Strings(profile.GetProperty("prefer")));
        Assert.Equal(["dairy"], Strings(profile.GetProperty("allergies")));
    }

    [Theory]
    [InlineData("dairy")] // an allergen is not a diet
    [InlineData("staff-pick")] // hidden, and not a diet
    [InlineData("no-such-diet")]
    [InlineData("")]
    public async Task Anything_but_a_diet_the_registry_shows_is_refused_by_name_and_nothing_is_saved(string id)
    {
        var client = Customer();
        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { "vegan" } });

        var response = await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { id } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty("prefer", out _));
        Assert.Equal(["vegan"], Strings((await JsonOf(await client.GetAsync("/catalog/preferences"))).GetProperty("prefer")));
    }

    [Fact]
    public async Task A_repeated_diet_is_refused_and_one_customers_preferences_are_not_another_customers()
    {
        var client = Customer();
        var twice = await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { "vegan", "vegan" } });
        Assert.Equal(HttpStatusCode.UnprocessableEntity, twice.StatusCode);

        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = new[] { "vegan" } });
        Assert.Empty((await JsonOf(await Customer("customer-2").GetAsync("/catalog/preferences"))).GetProperty("prefer").EnumerateArray());
    }

    [Fact]
    public async Task A_vendor_token_is_refused_the_profile_as_before()
    {
        var vendor = _app.CreateClient();
        vendor.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token("vendor-x", "Vendor"));

        Assert.Equal(HttpStatusCode.Forbidden, (await vendor.GetAsync("/catalog/preferences")).StatusCode);
    }

    // ---- the views -----------------------------------------------------------------------------------------

    private async Task PreferAsync(HttpClient client, params string[] diets) =>
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/catalog/preferences",
            new { allergies = Array.Empty<string>(), avoid = Array.Empty<string>(), prefer = diets })).StatusCode);

    [Fact]
    public async Task The_personalized_list_and_detail_say_which_listings_the_bakery_has_marked_for_a_preferred_diet()
    {
        await SeedAsync();
        var client = Customer();
        await PreferAsync(client, "vegan");

        var list = await JsonOf(await client.GetAsync("/catalog/listings/for-me"));
        var byId = list.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("listing").GetProperty("id").GetString()!);

        var loaf = byId["l-loaf"].GetProperty("dietMatches")[0];
        Assert.Equal(("vegan", true, true), (loaf.GetProperty("tagId").GetString(), loaf.GetProperty("marked").GetBoolean(), loaf.GetProperty("itemMarked").GetBoolean()));
        Assert.Equal(["honey"], Strings(loaf.GetProperty("optionIdsNotMarked"))); // choosing honey would remove the claim
        var roll = byId["l-roll"].GetProperty("dietMatches")[0];
        Assert.False(roll.GetProperty("marked").GetBoolean());

        var detail = await JsonOf(await client.GetAsync("/catalog/listings/for-me/l-loaf"));
        Assert.True(detail.GetProperty("dietMatches")[0].GetProperty("marked").GetBoolean());
    }

    [Fact]
    public async Task A_customer_who_prefers_no_diet_gets_an_empty_list_and_the_public_listing_carries_no_matches()
    {
        await SeedAsync();
        var client = Customer();

        var detail = await JsonOf(await client.GetAsync("/catalog/listings/for-me/l-loaf"));
        Assert.Empty(detail.GetProperty("dietMatches").EnumerateArray());

        var publicListing = await JsonOf(await _app.CreateClient().GetAsync("/catalog/listings/l-loaf"));
        Assert.False(publicListing.TryGetProperty("dietMatches", out _)); // nothing personal in a cacheable response
    }

    [Fact]
    public async Task The_cart_check_applies_the_rule_to_the_options_actually_chosen()
    {
        await SeedAsync();
        var client = Customer();
        await PreferAsync(client, "vegan");

        async Task<JsonElement> Check(string[] options) => (await JsonOf(await client.PostAsJsonAsync("/catalog/preferences/check",
            new { lines = new[] { new { listingId = "l-loaf", optionIds = options } } }))).GetProperty("lines")[0].GetProperty("dietMatches")[0];

        var plain = await Check([]);
        Assert.True(plain.GetProperty("marked").GetBoolean());

        var withSeeds = await Check(["seeds"]);
        Assert.True(withSeeds.GetProperty("marked").GetBoolean()); // the chosen option carries the tag too

        var withHoney = await Check(["seeds", "honey"]);
        Assert.False(withHoney.GetProperty("marked").GetBoolean());
        Assert.True(withHoney.GetProperty("itemMarked").GetBoolean());
        Assert.Equal(["honey"], Strings(withHoney.GetProperty("optionIdsNotMarked"))); // only the chosen ones are named
    }
}
