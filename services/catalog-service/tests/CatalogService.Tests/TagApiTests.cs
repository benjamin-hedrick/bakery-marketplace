using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Seed;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Tags;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>WI-TAG-001 over HTTP: the public registry endpoint, and the closed allergen list on listings (ADR-0022).</summary>
public sealed class TagApiTests : IDisposable
{
    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private const string Registry = """
        { "tags": [
          { "id": "dairy", "kind": "allergen", "label": "Milk (dairy)", "sortOrder": 10 },
          { "id": "tree-nut", "kind": "allergen", "label": "Tree nuts", "sortOrder": 20 },
          { "id": "old-allergen", "kind": "allergen", "label": "Old", "retired": true },
          { "id": "vegan", "kind": "diet", "label": "Vegan", "sortOrder": 30 },
          { "id": "staff-pick", "kind": "theme", "label": "Staff pick", "visibility": "hidden", "assignableBy": "platform" },
          { "id": "thanksgiving", "kind": "occasion", "label": "Thanksgiving", "sortOrder": 40, "activeFrom": "2026-11-01", "activeTo": "2026-11-28" }
        ] }
        """;

    private readonly FixedTime _time = new(new DateTimeOffset(2026, 11, 3, 12, 0, 0, TimeSpan.Zero));
    private readonly CatalogFactory _factory = new();
    private readonly WebApplicationFactory<Program> _withRegistry;
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";

    public TagApiTests()
    {
        _withRegistry = _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
        {
            services.RemoveAll<ITagRegistry>();
            services.AddSingleton<ITagRegistry>(TagRegistry.Parse(Registry));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_time);
        }));
    }

    public void Dispose()
    {
        _withRegistry.Dispose();
        _factory.Dispose();
    }

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static string[] Ids(JsonElement body) => body.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!).ToArray();

    // ---- GET /catalog/tags -------------------------------------------------------------------

    [Fact]
    public async Task The_registry_is_anonymous_and_lists_public_tags_active_today_in_order()
    {
        var response = await _withRegistry.CreateClient().GetAsync("/catalog/tags");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(["dairy", "tree-nut", "vegan", "thanksgiving"], Ids(await JsonOf(response)));
    }

    [Fact]
    public async Task Hidden_retired_and_out_of_window_tags_are_absent_and_nothing_about_visibility_is_exposed()
    {
        var response = await _withRegistry.CreateClient().GetAsync("/catalog/tags");
        var text = await response.Content.ReadAsStringAsync();
        _time.Now = new DateTimeOffset(2026, 11, 29, 0, 0, 0, TimeSpan.Zero); // the day after the window
        var later = await _withRegistry.CreateClient().GetAsync("/catalog/tags");

        Assert.DoesNotContain("staff-pick", text);
        Assert.DoesNotContain("old-allergen", text);
        Assert.DoesNotContain("visibility", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("assignableBy", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("thanksgiving", await later.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_window_includes_its_first_and_last_day_in_utc()
    {
        _time.Now = new DateTimeOffset(2026, 10, 31, 23, 59, 0, TimeSpan.Zero);
        Assert.DoesNotContain("thanksgiving", Ids(await JsonOf(await _withRegistry.CreateClient().GetAsync("/catalog/tags"))));
        _time.Now = new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero);
        Assert.Contains("thanksgiving", Ids(await JsonOf(await _withRegistry.CreateClient().GetAsync("/catalog/tags"))));
        _time.Now = new DateTimeOffset(2026, 11, 28, 23, 59, 0, TimeSpan.Zero);
        Assert.Contains("thanksgiving", Ids(await JsonOf(await _withRegistry.CreateClient().GetAsync("/catalog/tags"))));
    }

    [Fact]
    public async Task The_kind_filter_narrows_the_list_and_an_unknown_kind_is_refused()
    {
        var allergens = await _withRegistry.CreateClient().GetAsync("/catalog/tags?kind=allergen");
        var diets = await _withRegistry.CreateClient().GetAsync("/catalog/tags?kind=DIET");
        var bad = await _withRegistry.CreateClient().GetAsync("/catalog/tags?kind=cuisine");

        Assert.Equal(["dairy", "tree-nut"], Ids(await JsonOf(allergens)));
        Assert.Equal(["vegan"], Ids(await JsonOf(diets)));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, bad.StatusCode);
        Assert.Equal("validation_failed", (await JsonOf(bad)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_response_names_the_kind_in_lower_case_and_is_cacheable()
    {
        var response = await _withRegistry.CreateClient().GetAsync("/catalog/tags?kind=allergen");
        var first = (await JsonOf(response)).GetProperty("items")[0];

        Assert.Equal("allergen", first.GetProperty("kind").GetString());
        Assert.Equal("Milk (dairy)", first.GetProperty("label").GetString());
        Assert.Equal(TagEndpoints.CacheControl, response.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task The_shipped_registry_is_served_when_nothing_is_replaced()
    {
        var response = await _factory.CreateClient().GetAsync("/catalog/tags?kind=allergen");

        Assert.Equal(["dairy", "egg", "fish", "shellfish", "tree-nut", "peanut", "gluten", "soy", "sesame"], Ids(await JsonOf(response)));
    }

    // ---- the closed allergen list on listings --------------------------------------------------

    private static object Listing(string[]? flags = null, string[]? optionAllergens = null) => new
    {
        name = "Almond Croissant",
        category = "pastry",
        priceCents = 450,
        allergenFlags = flags ?? ["gluten", "dairy"],
        modifiers = new[] { new { id = "mod-almond", name = "Extra almonds", priceDeltaCents = 75, allergens = optionAllergens ?? ["tree-nut"] } },
        status = "Draft",
    };

    private HttpClient Vendor() => _factory.ClientFor(_vendor, "Vendor");

    [Theory]
    [InlineData("tree-nut")]
    [InlineData("Tree-Nut")]   // stored as it has always been: trimmed and lower-cased
    [InlineData("  tree-nut  ")]
    public async Task A_known_allergen_is_accepted_however_it_is_cased_or_padded(string flag)
    {
        var response = await Vendor().PostAsJsonAsync("/catalog/listings", Listing([flag], [flag]));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("tree-nut", body.GetProperty("allergenFlags")[0].GetString());
        Assert.Equal("tree-nut", body.GetProperty("modifiers")[0].GetProperty("allergens")[0].GetString());
    }

    [Theory]
    [InlineData("tree-nuts")]
    [InlineData("nuts")]
    [InlineData("tree nut")]
    [InlineData("milk")]       // the id is "dairy": the closed list is exact
    [InlineData("vegan")]      // a tag, but not an allergen
    public async Task An_allergen_that_is_not_in_the_list_is_refused_naming_the_value_and_the_allowed_ids(string flag)
    {
        var response = await Vendor().PostAsJsonAsync("/catalog/listings", Listing([flag]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("validation_failed", body.GetProperty("code").GetString());
        var message = body.GetProperty("errors").GetProperty("allergenFlags")[0].GetString()!;
        Assert.Contains($"'{flag}'", message);
        Assert.Contains("dairy", message);
        Assert.Contains("tree-nut", message);
    }

    [Fact]
    public async Task An_option_allergen_outside_the_list_is_refused_with_the_option_named()
    {
        var response = await Vendor().PostAsJsonAsync("/catalog/listings", Listing(optionAllergens: ["almonds"]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var errors = (await JsonOf(response)).GetProperty("errors");
        Assert.Contains("'almonds'", errors.GetProperty("modifiers[0].allergens")[0].GetString());
    }

    [Fact]
    public async Task An_update_is_held_to_the_same_list()
    {
        var created = await JsonOf(await Vendor().PostAsJsonAsync("/catalog/listings", Listing()));
        var id = created.GetProperty("id").GetString();

        var bad = await Vendor().PutAsJsonAsync($"/catalog/listings/{id}", Listing(["nuts"]));
        var good = await Vendor().PutAsJsonAsync($"/catalog/listings/{id}", Listing(["tree-nut"]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, bad.StatusCode);
        Assert.Equal(HttpStatusCode.OK, good.StatusCode);
    }

    [Fact]
    public async Task Reads_never_reject_a_listing_stored_with_an_old_value_and_its_next_update_must_correct_it()
    {
        await _factory.VerifyVendorAsync(_vendor);
        var old = await _factory.SeedListingAsync(_vendor, "listing-old");
        old.AllergenFlags = ["tree nuts", "nuts"]; // stored before the list was closed
        await _factory.Listings.SaveAsync(old, _vendor);

        var read = await _factory.CreateClient().GetAsync("/catalog/listings/listing-old");
        var update = await Vendor().PutAsJsonAsync("/catalog/listings/listing-old", Listing(["tree nuts"]));
        var corrected = await Vendor().PutAsJsonAsync("/catalog/listings/listing-old", Listing(["tree-nut"]));

        Assert.Equal(HttpStatusCode.OK, read.StatusCode);
        Assert.Equal(["tree nuts", "nuts"], (await JsonOf(read)).GetProperty("allergenFlags").EnumerateArray().Select(e => e.GetString()).ToArray());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, update.StatusCode);
        Assert.Equal(HttpStatusCode.OK, corrected.StatusCode);
    }

    [Fact]
    public async Task A_value_that_is_also_structurally_bad_is_reported_once()
    {
        var response = await Vendor().PostAsJsonAsync("/catalog/listings", Listing([new string('x', 41)]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var messages = (await JsonOf(response)).GetProperty("errors").GetProperty("allergenFlags").EnumerateArray().Select(e => e.GetString()!).ToArray();
        Assert.Single(messages);
        Assert.Contains("at most 40", messages[0]);
    }

    // ---- the seed ------------------------------------------------------------------------------

    [Fact]
    public void Every_allergen_value_in_the_seed_is_in_the_registry()
    {
        var allowed = TagRegistry.LoadEmbedded().VendorAllergenIds.ToHashSet();

        foreach (var listing in SeedData.Listings())
        {
            Assert.All(listing.AllergenFlags, f => Assert.Contains(f, allowed));
            Assert.All(listing.Modifiers.SelectMany(m => m.Allergens), a => Assert.Contains(a, allowed));
        }
    }

    [Fact]
    public void The_seed_listings_pass_the_listing_validator()
    {
        var allowed = TagRegistry.LoadEmbedded().VendorAllergenIds;

        foreach (var l in SeedData.Listings())
        {
            var request = new ListingRequest(
                l.Name, l.Description, l.Category, l.PriceCents,
                l.Modifiers.Select(m => new ModifierRequest(m.Id, m.Name, m.PriceDeltaCents, m.Allergens)).ToList(), l.AllergenFlags, l.Status);
            var errors = ListingValidator.Validate(request, statusRequired: false, allowed);

            Assert.True(errors.Count == 0, $"{l.Id}: {string.Join("; ", errors.SelectMany(e => e.Value))}");
        }
    }
}
