using System.Net;
using System.Text.Json;
using CatalogService.Domain;
using CatalogService.Tags;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>
/// WI-TAG-003 over HTTP: <c>GET /catalog/listings?tag=a&amp;tag=b</c> returns the published listings that carry all the tags on the listing itself. Only a tag that is
/// public, active and not an allergen may be used, and every other id is refused in the same words (a hidden tag cannot be found by asking).
/// </summary>
public sealed class TagFilterApiTests : IDisposable
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

    public TagFilterApiTests()
    {
        _app = _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
        {
            services.RemoveAll<ITagRegistry>();
            services.AddSingleton<ITagRegistry>(TagRegistry.Parse(Registry));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_time);
        }));
    }

    public void Dispose()
    {
        _app.Dispose();
        _factory.Dispose();
    }

    private async Task SeedAsync()
    {
        await _app.Services.GetRequiredService<BakeryMarketplace.Eventing.IEventPublisher>().PublishAsync(
            new BakeryMarketplace.Eventing.DomainEventEnvelope<BakeryMarketplace.EventSchemas.VendorVerifiedPayload>(
                Guid.NewGuid(), "VendorVerified", 1, DateTimeOffset.UtcNow, "Vendor", _vendor, 1, new BakeryMarketplace.EventSchemas.VendorVerifiedPayload(_vendor)));
        var repo = _app.Services.GetRequiredService<BakeryMarketplace.Data.IRepository<ListingDocument>>();
        async Task Add(string id, string[]? tags, string[]? platform = null, string[]? optionTags = null, string status = ListingStatuses.Published)
        {
            var now = DateTimeOffset.UtcNow;
            await repo.SaveAsync(new ListingDocument
            {
                Id = id,
                VendorId = _vendor,
                Name = id,
                Category = "bread",
                PriceCents = 800,
                Status = status,
                CreatedAt = now,
                UpdatedAt = now,
                Version = 1,
                Tags = tags?.ToList(),
                PlatformTags = platform?.ToList(),
                Modifiers = [new ModifierDocument { Id = "mod-1", Name = "Extra", PriceDeltaCents = 0, Tags = optionTags?.ToList() }],
            }, _vendor);
        }
        await Add("l-a", ["vegan", "local"], optionTags: ["vegetarian"]);
        await Add("l-b", ["vegan"]);
        await Add("l-c", ["local"], platform: ["featured", "staff-pick"]);
        await Add("l-d", ["vegan"], status: ListingStatuses.Draft);
        await Add("l-e", ["thanksgiving"]);
        await Add("l-f", null);
        await Add("l-g", ["vegan"]);
    }

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<string[]> IdsAsync(string query)
    {
        var response = await _app.CreateClient().GetAsync("/catalog/listings" + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await JsonOf(response)).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!).ToArray();
    }

    [Fact]
    public async Task One_tag_returns_the_published_listings_that_carry_it_and_not_a_draft()
    {
        await SeedAsync();

        Assert.Equal(["l-a", "l-b", "l-g"], await IdsAsync("?tag=vegan"));
    }

    [Fact]
    public async Task Two_tags_return_only_the_listings_that_carry_both()
    {
        await SeedAsync();

        Assert.Equal(["l-a"], await IdsAsync("?tag=vegan&tag=local"));
        Assert.Equal(["l-a", "l-c"], await IdsAsync("?tag=local"));
        Assert.Empty(await IdsAsync("?tag=vegan&tag=featured"));
    }

    [Fact]
    public async Task A_tag_on_an_option_only_does_not_select_the_listing()
    {
        await SeedAsync();

        Assert.Empty(await IdsAsync("?tag=vegetarian"));
    }

    [Fact]
    public async Task A_public_platform_tag_selects_like_any_other_and_ids_are_not_case_sensitive_and_repeats_are_fine()
    {
        await SeedAsync();

        Assert.Equal(["l-c"], await IdsAsync("?tag=featured"));
        Assert.Equal(["l-a", "l-b", "l-g"], await IdsAsync("?tag=VEGAN&tag=vegan&tag=%20vegan"));
    }

    [Fact]
    public async Task No_filter_is_the_unfiltered_browse()
    {
        await SeedAsync();

        Assert.Equal(["l-a", "l-b", "l-c", "l-e", "l-f", "l-g"], await IdsAsync(""));
    }

    [Theory]
    [InlineData("nonsense")] // unknown
    [InlineData("staff-pick")] // hidden
    [InlineData("old-diet")] // retired
    [InlineData("dairy")] // an allergen: it lives in its own field, so a filter on it would match nothing and read as "free of it"
    [InlineData("thanksgiving")] // outside its window: the test sets the clock to the day before it opens
    public async Task An_id_that_is_not_a_public_active_non_allergen_tag_is_refused_in_the_same_words_as_any_other(string id)
    {
        await SeedAsync();
        if (id == "thanksgiving") _time.Now = DateTimeOffset.Parse("2026-10-31T12:00:00Z"); // the day before its window

        var response = await _app.CreateClient().GetAsync($"/catalog/listings?tag=vegan&tag={id}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("validation_failed", body.GetProperty("code").GetString());
        Assert.Equal(TagFilter.RefusalMessage, body.GetProperty("errors").GetProperty("tag[1]")[0].GetString());
    }

    [Fact]
    public async Task A_hidden_tag_cannot_be_told_from_one_that_does_not_exist()
    {
        await SeedAsync();
        var client = _app.CreateClient();

        var hidden = await (await client.GetAsync("/catalog/listings?tag=staff-pick")).Content.ReadAsStringAsync();
        var unknown = await (await client.GetAsync("/catalog/listings?tag=staff-pock")).Content.ReadAsStringAsync();

        Assert.Equal(unknown.Replace("staff-pock", "staff-pick"), hidden); // the same body, word for word
    }

    [Theory]
    [InlineData("2026-10-31", false)]
    [InlineData("2026-11-01", true)]
    [InlineData("2026-11-28", true)]
    [InlineData("2026-11-29", false)]
    public async Task A_windowed_tag_can_be_filtered_by_only_inside_its_window(string today, bool allowed)
    {
        await SeedAsync();
        _time.Now = DateTimeOffset.Parse($"{today}T12:00:00Z");

        var response = await _app.CreateClient().GetAsync("/catalog/listings?tag=thanksgiving");

        Assert.Equal(allowed ? HttpStatusCode.OK : HttpStatusCode.UnprocessableEntity, response.StatusCode);
        if (allowed) Assert.Equal(["l-e"], (await JsonOf(response)).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!));
    }

    [Fact]
    public async Task Paging_works_with_a_filter_pages_are_full_and_the_cursor_means_after_this_id()
    {
        await SeedAsync();
        var client = _app.CreateClient();

        var first = await JsonOf(await client.GetAsync("/catalog/listings?tag=vegan&limit=2"));
        var firstIds = first.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!).ToArray();
        var cursor = first.GetProperty("nextCursor").GetString();
        var second = await JsonOf(await client.GetAsync($"/catalog/listings?tag=vegan&limit=2&after={cursor}"));

        Assert.Equal(["l-a", "l-b"], firstIds); // full, though l-c (no vegan) would have sat between them in the unfiltered order
        Assert.Equal("l-b", cursor);
        Assert.Equal(["l-g"], second.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!));
        Assert.Equal(JsonValueKind.Null, second.GetProperty("nextCursor").ValueKind);
    }

    [Fact]
    public async Task More_tags_than_the_limit_are_refused_and_the_limit_is_a_setting()
    {
        await SeedAsync();
        var many = string.Join("&", Enumerable.Repeat("tag=vegan", new TagOptions().MaxFilterTags + 1));

        var response = await _app.CreateClient().GetAsync($"/catalog/listings?{many}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty("tag", out _));
        Assert.Equal(10, new TagOptions().MaxFilterTags);
    }

    [Fact]
    public async Task A_filtered_response_has_the_same_cache_headers_as_the_unfiltered_one()
    {
        await SeedAsync();
        var client = _app.CreateClient();

        var plain = await client.GetAsync("/catalog/listings");
        var filtered = await client.GetAsync("/catalog/listings?tag=vegan");

        Assert.Equal(plain.Headers.CacheControl?.ToString(), filtered.Headers.CacheControl?.ToString());
        Assert.Equal(plain.Headers.Vary.ToString(), filtered.Headers.Vary.ToString());
    }

    [Fact]
    public async Task A_listing_carries_a_tag_for_the_filter_only_while_the_tag_is_active_so_a_retired_tag_on_a_listing_cannot_be_used_to_find_it()
    {
        await SeedAsync();
        var repo = _app.Services.GetRequiredService<BakeryMarketplace.Data.IRepository<ListingDocument>>();
        var doc = (await repo.GetAsync("l-b", _vendor))!;
        doc.Tags = ["old-diet"]; // retired since it was assigned
        await repo.SaveAsync(doc, _vendor);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await _app.CreateClient().GetAsync("/catalog/listings?tag=old-diet")).StatusCode);
        Assert.DoesNotContain("l-b", await IdsAsync("?tag=vegan"));
    }
}
