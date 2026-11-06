using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CatalogService.Domain;
using CatalogService.Tags;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>
/// WI-TAG-002 over HTTP: vendors assign tags to their listings and options (ADR-0022). Assignment is checked against the registry and the caps; the platform's
/// tags are out of a vendor's reach; a public response shows only tags that are public and inside their window today by the catalog's own clock; the owning
/// vendor sees what they assigned, with the tags that are not showing marked inactive.
/// </summary>
public sealed class TagAssignmentApiTests : IDisposable
{
    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private const string Registry = """
        { "tags": [
          { "id": "dairy", "kind": "allergen", "label": "Milk (dairy)", "sortOrder": 10 },
          { "id": "vegan", "kind": "diet", "label": "Vegan", "sortOrder": 30 },
          { "id": "vegetarian", "kind": "diet", "label": "Vegetarian", "sortOrder": 35 },
          { "id": "thanksgiving", "kind": "occasion", "label": "Thanksgiving", "sortOrder": 40, "activeFrom": "2026-11-01", "activeTo": "2026-11-28" },
          { "id": "staff-pick", "kind": "theme", "label": "Staff pick", "visibility": "hidden", "assignableBy": "platform", "sortOrder": 50 },
          { "id": "featured", "kind": "theme", "label": "Featured", "assignableBy": "platform", "sortOrder": 60 },
          { "id": "old-diet", "kind": "diet", "label": "Old diet", "retired": true, "sortOrder": 70 },
          { "id": "local", "kind": "theme", "label": "Local favourite", "sortOrder": 80 }
        ] }
        """;

    private readonly FixedTime _time = new(new DateTimeOffset(2026, 11, 3, 12, 0, 0, TimeSpan.Zero));
    private readonly CatalogFactory _factory = new();
    private readonly WebApplicationFactory<Program> _app;
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";
    private HttpClient _vendorClient = null!;
    private WebApplicationFactory<Program>? _repoHost;

    /// <summary>The listing store of the host the vendor is using (each host keeps its own in memory).</summary>
    private BakeryMarketplace.Data.IRepository<ListingDocument> Repo => (_repoHost ?? _app).Services.GetRequiredService<BakeryMarketplace.Data.IRepository<ListingDocument>>();

    public TagAssignmentApiTests()
    {
        _app = Host(null);
    }

    public void Dispose()
    {
        _vendorClient?.Dispose();
        _app.Dispose();
        _factory.Dispose();
    }

    private WebApplicationFactory<Program> Host(Action<TagOptions>? caps, string? registry = null) => _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
    {
        services.RemoveAll<ITagRegistry>();
        services.AddSingleton<ITagRegistry>(TagRegistry.Parse(registry ?? Registry));
        services.RemoveAll<TimeProvider>();
        services.AddSingleton<TimeProvider>(_time);
        if (caps is not null) services.PostConfigure(caps);
    }));

    private async Task<HttpClient> VendorAsync(WebApplicationFactory<Program>? app = null)
    {
        var host = app ?? _app;
        _repoHost = host;
        await host.Services.GetRequiredService<BakeryMarketplace.Eventing.IEventPublisher>().PublishAsync(
            new BakeryMarketplace.Eventing.DomainEventEnvelope<BakeryMarketplace.EventSchemas.VendorVerifiedPayload>(
                Guid.NewGuid(), "VendorVerified", 1, DateTimeOffset.UtcNow, "Vendor", _vendor, 1, new BakeryMarketplace.EventSchemas.VendorVerifiedPayload(_vendor)));
        _vendorClient?.Dispose();
        _vendorClient = host.CreateClient();
        _vendorClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token(_vendor, "Vendor"));
        return _vendorClient;
    }

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static object Body(string[]? tags = null, string[]? optionTags = null, bool omitTags = false)
    {
        var option = optionTags is null ? (object)new { id = "mod-seeds", name = "Seed crust", priceDeltaCents = 100, allergens = Array.Empty<string>() }
            : new { id = "mod-seeds", name = "Seed crust", priceDeltaCents = 100, allergens = Array.Empty<string>(), tags = optionTags };
        return omitTags
            ? new { name = "Loaf", category = "bread", priceCents = 800, status = "Published", modifiers = new[] { option } }
            : new { name = "Loaf", category = "bread", priceCents = 800, status = "Published", modifiers = new[] { option }, tags };
    }

    private static string[] Ids(JsonElement tags) => tags.EnumerateArray().Select(t => t.GetProperty("id").GetString()!).ToArray();

    private static async Task<string> CreateAsync(HttpClient client, object body)
    {
        var response = await client.PostAsJsonAsync("/catalog/listings", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await JsonOf(response)).GetProperty("id").GetString()!;
    }

    private async Task<JsonElement> PublicAsync(string id, WebApplicationFactory<Program>? app = null) =>
        await JsonOf(await (app ?? _repoHost ?? _app).CreateClient().GetAsync($"/catalog/listings/{id}"));

    private static async Task<JsonElement> OwnAsync(HttpClient client, string id) => await JsonOf(await client.GetAsync($"/catalog/listings/mine/{id}"));

    // ---- assignment ----------------------------------------------------------------------------------------

    [Fact]
    public async Task A_vendor_assigns_tags_to_a_listing_and_to_an_option_and_they_come_back_in_registry_order()
    {
        var vendor = await VendorAsync();

        var id = await CreateAsync(vendor, Body(["vegetarian", "vegan", "local"], ["vegan"]));

        var own = await OwnAsync(vendor, id);
        Assert.Equal(["vegetarian", "vegan", "local"], Ids(own.GetProperty("tags"))); // the owner sees them in the order they assigned them
        var pub = await PublicAsync(id);
        Assert.Equal(["vegan", "vegetarian", "local"], Ids(pub.GetProperty("tags"))); // registry order
        Assert.Equal(["vegan"], Ids(pub.GetProperty("modifiers")[0].GetProperty("tags")));
        var vegan = pub.GetProperty("tags")[0];
        Assert.Equal(("diet", "Vegan"), (vegan.GetProperty("kind").GetString(), vegan.GetProperty("label").GetString()));
    }

    [Theory]
    [InlineData("nonsense", "'nonsense' is not a tag the catalog offers.")]
    [InlineData("dairy", "allergen")] // allergens keep their own fields
    [InlineData("staff-pick", "cannot be assigned by a vendor")] // hidden, platform only
    [InlineData("featured", "cannot be assigned by a vendor")] // public but platform only
    [InlineData("old-diet", "cannot be assigned by a vendor")] // retired
    [InlineData("", "A tag id is required")]
    public async Task A_tag_a_vendor_may_not_assign_is_422_naming_the_field_and_the_value(string tag, string message)
    {
        var vendor = await VendorAsync();

        var response = await vendor.PostAsJsonAsync("/catalog/listings", Body(["vegan", tag]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var errors = (await JsonOf(response)).GetProperty("errors");
        Assert.Contains(message, errors.GetProperty("tags[1]")[0].GetString());
        Assert.Empty((await JsonOf(await vendor.GetAsync("/catalog/listings/mine"))).GetProperty("items").EnumerateArray()); // nothing was created
    }

    [Fact]
    public async Task The_same_rules_apply_to_the_tags_of_an_option()
    {
        var vendor = await VendorAsync();

        var response = await vendor.PostAsJsonAsync("/catalog/listings", Body(["vegan"], ["vegan", "staff-pick"]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty("modifiers[0].tags[1]", out _));
    }

    [Fact]
    public async Task Duplicates_are_removed_and_counted_once()
    {
        var vendor = await VendorAsync(Host(o => { o.MaxPerListing = 2; o.MaxPerOption = 1; }));

        var id = await CreateAsync(vendor, Body(["vegan", "VEGAN", " vegan ", "vegetarian"], ["vegan", "vegan"]));

        var own = await OwnAsync(vendor, id);
        Assert.Equal(["vegan", "vegetarian"], Ids(own.GetProperty("tags")));
        Assert.Equal(["vegan"], Ids(own.GetProperty("modifiers")[0].GetProperty("tags")));
    }

    // ---- the caps are one setting ---------------------------------------------------------------------------

    [Fact]
    public void The_caps_default_to_twelve_and_six()
    {
        Assert.Equal((12, 6), (new TagOptions().MaxPerListing, new TagOptions().MaxPerOption));
    }

    [Fact]
    public async Task More_tags_than_the_cap_on_a_listing_or_an_option_is_refused_and_the_cap_is_a_setting_not_a_number_in_the_code()
    {
        var vendor = await VendorAsync(Host(o => { o.MaxPerListing = 2; o.MaxPerOption = 1; }));

        var tooManyOnListing = await vendor.PostAsJsonAsync("/catalog/listings", Body(["vegan", "vegetarian", "local"]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooManyOnListing.StatusCode);
        Assert.Equal("At most 2 tags.", (await JsonOf(tooManyOnListing)).GetProperty("errors").GetProperty("tags")[0].GetString());

        var tooManyOnOption = await vendor.PostAsJsonAsync("/catalog/listings", Body(["vegan"], ["vegan", "vegetarian"]));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooManyOnOption.StatusCode);
        Assert.Equal("At most 1 tags.", (await JsonOf(tooManyOnOption)).GetProperty("errors").GetProperty("modifiers[0].tags")[0].GetString());

        // Exactly at the cap is fine.
        await CreateAsync(vendor, Body(["vegan", "vegetarian"], ["vegan"]));
    }

    [Fact]
    public async Task With_the_shipped_defaults_thirteen_tags_are_refused_and_twelve_are_not()
    {
        var many = string.Join(",", Enumerable.Range(1, 13).Select(i => $$"""{ "id": "d{{i:00}}", "kind": "diet", "label": "D{{i}}", "sortOrder": {{i}} }"""));
        var vendor = await VendorAsync(Host(null, $$"""{ "tags": [ {{many}} ] }"""));
        var ids = Enumerable.Range(1, 13).Select(i => $"d{i:00}").ToArray();

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await vendor.PostAsJsonAsync("/catalog/listings", Body(ids))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await vendor.PostAsJsonAsync("/catalog/listings", Body(ids.Take(12).ToArray()))).StatusCode);
    }

    // ---- update semantics -----------------------------------------------------------------------------------

    [Fact]
    public async Task An_update_without_a_tags_list_leaves_the_tags_and_an_empty_list_clears_the_vendors_own()
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, Body(["vegan"], ["vegan"]));

        var untouched = await vendor.PutAsJsonAsync($"/catalog/listings/{id}", Body(omitTags: true));
        Assert.Equal(HttpStatusCode.OK, untouched.StatusCode);
        var own = await JsonOf(untouched);
        Assert.Equal(["vegan"], Ids(own.GetProperty("tags")));
        Assert.Equal(["vegan"], Ids(own.GetProperty("modifiers")[0].GetProperty("tags"))); // the option's too, as the request named none

        var cleared = await JsonOf(await vendor.PutAsJsonAsync($"/catalog/listings/{id}", Body([], []))); // both lists explicit and empty
        Assert.Empty(cleared.GetProperty("tags").EnumerateArray());
        Assert.Empty(cleared.GetProperty("modifiers")[0].GetProperty("tags").EnumerateArray());
    }

    [Fact]
    public async Task The_platforms_tags_are_untouched_by_any_vendor_request()
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, Body(["vegan"], ["vegan"]));
        var doc = (await Repo.GetAsync(id, _vendor))!;
        doc.PlatformTags = ["staff-pick", "featured"];
        doc.Modifiers[0].PlatformTags = ["featured"];
        await Repo.SaveAsync(doc, _vendor);

        // A vendor tries to set platform tags by name in the body, then updates normally, then clears their own tags.
        await vendor.PutAsJsonAsync($"/catalog/listings/{id}", new
        {
            name = "Loaf",
            category = "bread",
            priceCents = 800,
            status = "Published",
            tags = new[] { "vegan" },
            platformTags = new[] { "local" },
            modifiers = new[] { new { id = "mod-seeds", name = "Seed crust", priceDeltaCents = 100, allergens = Array.Empty<string>(), platformTags = new[] { "local" } } },
        });
        await vendor.PutAsJsonAsync($"/catalog/listings/{id}", Body([], []));

        var stored = (await Repo.GetAsync(id, _vendor))!;
        Assert.Equal(["staff-pick", "featured"], stored.PlatformTags);
        Assert.Equal(["featured"], stored.Modifiers[0].PlatformTags);
        Assert.Null(stored.Tags);
        // The vendor's own view never shows platform tags.
        Assert.Empty((await OwnAsync(vendor, id)).GetProperty("tags").EnumerateArray());
    }

    // ---- what a public response shows -----------------------------------------------------------------------

    [Fact]
    public async Task A_public_response_shows_only_public_active_tags_and_never_a_hidden_or_retired_one()
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, Body(["vegan", "thanksgiving"], ["vegan"]));
        var doc = (await Repo.GetAsync(id, _vendor))!;
        doc.PlatformTags = ["staff-pick", "featured"]; // one hidden, one public
        doc.Tags!.Add("old-diet"); // retired since it was assigned
        await Repo.SaveAsync(doc, _vendor);

        var pub = await PublicAsync(id);

        Assert.Equal(["vegan", "thanksgiving", "featured"], Ids(pub.GetProperty("tags")));
        var text = pub.GetRawText();
        Assert.DoesNotContain("staff-pick", text);
        Assert.DoesNotContain("old-diet", text);
        Assert.False(pub.GetProperty("tags")[0].TryGetProperty("active", out _)); // nothing about activity is exposed publicly
        // The browse list says the same.
        var list = await JsonOf(await (_repoHost ?? _app).CreateClient().GetAsync("/catalog/listings"));
        Assert.DoesNotContain("staff-pick", list.GetRawText());
        Assert.DoesNotContain("old-diet", list.GetRawText());
    }

    [Theory]
    [InlineData("2026-10-31", false)] // the day before
    [InlineData("2026-11-01", true)] // first day, inclusive
    [InlineData("2026-11-28", true)] // last day, inclusive
    [InlineData("2026-11-29", false)] // the day after
    public async Task A_windowed_tag_shows_from_its_first_day_to_its_last_by_the_catalogs_clock_on_the_listing_and_on_the_option(string today, bool shown)
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, new
        {
            name = "Loaf",
            category = "bread",
            priceCents = 800,
            status = "Published",
            tags = new[] { "thanksgiving", "vegan" },
            modifiers = new[] { new { id = "mod-seeds", name = "Seed crust", priceDeltaCents = 100, allergens = Array.Empty<string>(), tags = new[] { "thanksgiving" } } },
        });
        _time.Now = DateTimeOffset.Parse($"{today}T12:00:00Z");

        var pub = await PublicAsync(id);

        Assert.Equal(shown, Ids(pub.GetProperty("tags")).Contains("thanksgiving"));
        Assert.Equal(shown, Ids(pub.GetProperty("modifiers")[0].GetProperty("tags")).Contains("thanksgiving"));
        Assert.Contains("vegan", Ids(pub.GetProperty("tags"))); // an unwindowed tag is unaffected
    }

    [Fact]
    public async Task The_owning_vendor_sees_every_tag_they_assigned_with_the_ones_not_showing_marked_inactive()
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, Body(["vegan", "thanksgiving"], ["thanksgiving"]));
        var doc = (await Repo.GetAsync(id, _vendor))!;
        doc.Tags!.Add("old-diet"); // retired
        await Repo.SaveAsync(doc, _vendor);
        _time.Now = DateTimeOffset.Parse("2026-12-05T12:00:00Z"); // after the Thanksgiving window

        var own = await OwnAsync(vendor, id);

        var tags = own.GetProperty("tags").EnumerateArray().ToDictionary(t => t.GetProperty("id").GetString()!, t => t.GetProperty("active").GetBoolean());
        Assert.Equal(new Dictionary<string, bool> { ["vegan"] = true, ["thanksgiving"] = false, ["old-diet"] = false }, tags);
        Assert.False(own.GetProperty("modifiers")[0].GetProperty("tags")[0].GetProperty("active").GetBoolean());
        // The same listing in public shows only what is active.
        Assert.Equal(["vegan"], Ids((await PublicAsync(id)).GetProperty("tags")));
    }

    [Fact]
    public async Task Another_vendor_cannot_read_or_change_the_tags_of_a_listing_that_is_not_theirs()
    {
        var vendor = await VendorAsync();
        var id = await CreateAsync(vendor, Body(["vegan"]));
        var other = (_repoHost ?? _app).CreateClient();
        other.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token("vendor-other", "Vendor"));

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/catalog/listings/mine/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync($"/catalog/listings/{id}", Body([]))).StatusCode);
        Assert.Equal(["vegan"], Ids((await OwnAsync(vendor, id)).GetProperty("tags")));
    }
}
