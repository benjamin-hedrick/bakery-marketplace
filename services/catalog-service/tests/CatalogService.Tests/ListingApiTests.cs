using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.EventSchemas;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>WI-CAT-001 acceptance, exercised over HTTP against the real service pipeline.</summary>
public sealed class ListingApiTests : IDisposable
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _anon;

    // Unique per test instance so tests never depend on each other's data.
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";

    public ListingApiTests() => _anon = _factory.CreateClient();

    public void Dispose() => _factory.Dispose();

    private static object ValidListing(string? status = null, int priceCents = 800) => new
    {
        name = "Country Sourdough",
        description = "Naturally leavened.",
        category = "Bread",
        priceCents,
        allergenFlags = new[] { "Gluten", " gluten " },
        modifiers = new[] { new { id = "mod-seeds", name = "Seed crust", priceDeltaCents = 100, allergens = new[] { "Sesame" } } },
        status,
    };

    // ---- public reads -------------------------------------------------------------------------

    [Fact]
    public async Task Browse_is_anonymous_and_returns_only_published_listings_of_verified_vendors()
    {
        var other = $"vendor-{Guid.NewGuid():N}";
        var unverified = $"vendor-{Guid.NewGuid():N}";
        await _factory.VerifyVendorAsync(_vendor);
        await _factory.VerifyVendorAsync(other);
        await _factory.SeedListingAsync(_vendor, "listing-a-published");
        await _factory.SeedListingAsync(_vendor, "listing-b-draft", status: ListingStatuses.Draft);
        await _factory.SeedListingAsync(other, "listing-c-published");
        await _factory.SeedListingAsync(unverified, "listing-d-unverified-vendor");

        var page = await _anon.GetFromJsonAsync<ListingPage>("/catalog/listings");

        Assert.Equal(new[] { "listing-a-published", "listing-c-published" }, page!.Items.Select(i => i.Id).ToArray());
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task Browse_pages_with_limit_and_cursor_in_stable_order()
    {
        await _factory.VerifyVendorAsync(_vendor);
        foreach (var n in new[] { "listing-1", "listing-2", "listing-3" })
            await _factory.SeedListingAsync(_vendor, n);

        var first = await _anon.GetFromJsonAsync<ListingPage>("/catalog/listings?limit=2");
        Assert.Equal(new[] { "listing-1", "listing-2" }, first!.Items.Select(i => i.Id).ToArray());
        Assert.Equal("listing-2", first.NextCursor);

        var second = await _anon.GetFromJsonAsync<ListingPage>($"/catalog/listings?limit=2&after={first.NextCursor}");
        Assert.Equal(new[] { "listing-3" }, second!.Items.Select(i => i.Id).ToArray());
        Assert.Null(second.NextCursor);
    }

    [Fact]
    public async Task Browse_with_no_listings_is_an_empty_page_not_an_error()
    {
        var page = await _anon.GetFromJsonAsync<ListingPage>("/catalog/listings");
        Assert.Empty(page!.Items);
    }

    [Fact]
    public async Task Detail_returns_a_published_listing_with_the_contract_shape()
    {
        await _factory.VerifyVendorAsync(_vendor);
        await _factory.SeedListingAsync(_vendor, "listing-sourdough", priceCents: 800);

        var response = await _anon.GetAsync("/catalog/listings/listing-sourdough");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = json.RootElement;
        Assert.Equal(800, root.GetProperty("priceCents").GetInt32()); // integer cents (D-1)
        Assert.Equal("USD", root.GetProperty("currency").GetString());
        Assert.False(root.TryGetProperty("price", out _)); // no ambiguous unit-less field
        Assert.False(root.TryGetProperty("version", out _)); // internal field never leaves the service
        Assert.Equal(100, root.GetProperty("modifiers")[0].GetProperty("priceDeltaCents").GetInt32());
        Assert.Equal("Published", root.GetProperty("status").GetString());
    }

    [Theory]
    [InlineData("listing-draft")]
    [InlineData("listing-does-not-exist")]
    public async Task Detail_hides_drafts_and_unknown_ids_as_404(string id)
    {
        await _factory.VerifyVendorAsync(_vendor);
        await _factory.SeedListingAsync(_vendor, "listing-draft", status: ListingStatuses.Draft);

        var response = await _anon.GetAsync($"/catalog/listings/{id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("not_found", (await response.Content.ReadFromJsonAsync<ApiError>())!.Code);
    }

    [Fact]
    public async Task Listings_of_a_vendor_that_was_never_verified_are_not_public()
    {
        await _factory.SeedListingAsync(_vendor, "listing-x");
        Assert.Equal(HttpStatusCode.NotFound, (await _anon.GetAsync("/catalog/listings/listing-x")).StatusCode);
    }

    // ---- vendor verification events -----------------------------------------------------------

    [Fact]
    public async Task Suspension_hides_listings_without_rewriting_them_and_reverification_restores_them()
    {
        await _factory.VerifyVendorAsync(_vendor, sequence: 1);
        await _factory.SeedListingAsync(_vendor, "listing-s");
        Assert.Equal(HttpStatusCode.OK, (await _anon.GetAsync("/catalog/listings/listing-s")).StatusCode);

        await _factory.SuspendVendorAsync(_vendor, sequence: 2);
        Assert.Equal(HttpStatusCode.NotFound, (await _anon.GetAsync("/catalog/listings/listing-s")).StatusCode);
        Assert.Equal(ListingStatuses.Published, (await _factory.Listings.GetAsync("listing-s", _vendor))!.Status);

        await _factory.VerifyVendorAsync(_vendor, sequence: 3);
        Assert.Equal(HttpStatusCode.OK, (await _anon.GetAsync("/catalog/listings/listing-s")).StatusCode);
    }

    [Fact]
    public async Task A_stale_out_of_order_event_cannot_override_a_newer_one_and_duplicates_are_harmless()
    {
        await _factory.SeedListingAsync(_vendor, "listing-o");

        await _factory.SuspendVendorAsync(_vendor, sequence: 2); // arrives first
        await _factory.VerifyVendorAsync(_vendor, sequence: 1);  // older event arrives late: must be ignored
        Assert.Equal(HttpStatusCode.NotFound, (await _anon.GetAsync("/catalog/listings/listing-o")).StatusCode);

        await _factory.SuspendVendorAsync(_vendor, sequence: 2); // redelivery of the same event
        Assert.Equal(HttpStatusCode.NotFound, (await _anon.GetAsync("/catalog/listings/listing-o")).StatusCode);
    }

    // ---- vendor writes: authentication and authorization --------------------------------------

    [Fact]
    public async Task Writes_require_a_valid_token()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _anon.PostAsJsonAsync("/catalog/listings", ValidListing())).StatusCode);

        var expired = _factory.CreateClient();
        expired.DefaultRequestHeaders.Authorization = new("Bearer", _factory.Token(_vendor, "Vendor", lifetime: TimeSpan.FromMinutes(-10)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await expired.PostAsJsonAsync("/catalog/listings", ValidListing())).StatusCode);

        var forged = _factory.CreateClient();
        forged.DefaultRequestHeaders.Authorization = new("Bearer", _factory.Token(_vendor, "Vendor", wrongKey: true));
        Assert.Equal(HttpStatusCode.Unauthorized, (await forged.PostAsJsonAsync("/catalog/listings", ValidListing())).StatusCode);

        var wrongAudience = _factory.CreateClient();
        wrongAudience.DefaultRequestHeaders.Authorization = new("Bearer", _factory.Token(_vendor, "Vendor", audience: "someone-else"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await wrongAudience.PostAsJsonAsync("/catalog/listings", ValidListing())).StatusCode);
    }

    [Theory]
    [InlineData("Customer")]
    [InlineData("Admin")]
    public async Task Writes_require_the_vendor_role(string role)
    {
        var client = _factory.ClientFor("someone", role);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/catalog/listings", ValidListing())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/catalog/listings/any", ValidListing())).StatusCode);
    }

    // ---- vendor writes: create ----------------------------------------------------------------

    [Fact]
    public async Task Create_makes_a_draft_owned_by_the_token_subject_ignoring_client_supplied_ownership()
    {
        var client = _factory.ClientFor(_vendor, "Vendor");
        var body = new
        {
            name = "Almond Croissant", category = "Pastry", priceCents = 450,
            vendorId = "someone-else", id = "attacker-chosen-id", sponsored = true, version = 99, status = (string?)null,
        };

        var response = await client.PostAsJsonAsync("/catalog/listings", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<ListingDto>())!;
        Assert.Equal(_vendor, created.VendorId);
        Assert.StartsWith("listing-", created.Id);
        Assert.NotEqual("attacker-chosen-id", created.Id);
        Assert.False(created.Sponsored);
        Assert.Equal(ListingStatuses.Draft, created.Status);
        Assert.Equal($"/catalog/listings/{created.Id}", response.Headers.Location!.ToString());
        Assert.Null(await _factory.Listings.GetAsync(created.Id, "someone-else"));
        Assert.Equal(1, (await _factory.Listings.GetAsync(created.Id, _vendor))!.Version);
    }

    [Fact]
    public async Task Create_normalizes_allergen_text()
    {
        var created = await CreateAsync(ValidListing());
        Assert.Equal(new[] { "gluten" }, created.AllergenFlags);
        Assert.Equal(new[] { "sesame" }, created.Modifiers[0].Allergens);
    }

    [Fact]
    public async Task A_vendor_cannot_publish_until_verified_and_a_server_side_event_is_what_verifies_them()
    {
        var client = _factory.ClientFor(_vendor, "Vendor");

        var rejected = await client.PostAsJsonAsync("/catalog/listings", ValidListing(status: "Published"));
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Equal("vendor_not_verified", (await rejected.Content.ReadFromJsonAsync<ApiError>())!.Code);

        await _factory.VerifyVendorAsync(_vendor);
        var accepted = await client.PostAsJsonAsync("/catalog/listings", ValidListing(status: "Published"));
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        var listing = (await accepted.Content.ReadFromJsonAsync<ListingDto>())!;
        Assert.Equal(HttpStatusCode.OK, (await _anon.GetAsync($"/catalog/listings/{listing.Id}")).StatusCode);
    }

    [Fact]
    public async Task Publishing_emits_ListingPublished_once_with_a_per_listing_sequence()
    {
        var events = new List<DomainEventEnvelope<ListingPublishedPayload>>();
        await _factory.Services.GetRequiredService<IEventSubscriber>()
            .SubscribeAsync<ListingPublishedPayload>("ListingPublished", (e, _) => { events.Add(e); return Task.CompletedTask; });
        await _factory.VerifyVendorAsync(_vendor);
        var client = _factory.ClientFor(_vendor, "Vendor");

        var draft = await CreateAsync(ValidListing(), client);
        Assert.Empty(events); // drafts publish nothing

        await client.PutAsJsonAsync($"/catalog/listings/{draft.Id}", ValidListing(status: "Published"));
        await client.PutAsJsonAsync($"/catalog/listings/{draft.Id}", ValidListing(status: "Published", priceCents: 900)); // edit, not a transition

        var e = Assert.Single(events);
        Assert.Equal(draft.Id, e.Payload.ListingId);
        Assert.Equal(_vendor, e.Payload.VendorId);
        Assert.Equal("ListingPublished", e.EventType);
        Assert.Equal("Listing", e.AggregateType);
        Assert.Equal(2, e.SequenceNumber); // create (1) then the publish update (2)
    }

    [Theory]
    [MemberData(nameof(InvalidListings))]
    public async Task Invalid_input_is_rejected_with_field_errors_and_nothing_is_stored(string field, object body)
    {
        var client = _factory.ClientFor(_vendor, "Vendor");

        var response = await client.PostAsJsonAsync("/catalog/listings", body);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var error = (await response.Content.ReadFromJsonAsync<ApiError>())!;
        Assert.Equal("validation_failed", error.Code);
        Assert.Contains(error.Errors!.Keys, k => k == field || k.StartsWith(field, StringComparison.Ordinal));
        Assert.Empty(await Drain(_factory.Listings.QueryAsync(_vendor, q => q)));
    }

    public static IEnumerable<object[]> InvalidListings()
    {
        yield return new object[] { "name", new { name = "  ", category = "Bread", priceCents = 100 } };
        yield return new object[] { "category", new { name = "x", priceCents = 100 } };
        yield return new object[] { "priceCents", new { name = "x", category = "Bread" } };
        yield return new object[] { "priceCents", new { name = "x", category = "Bread", priceCents = -1 } };
        yield return new object[] { "priceCents", new { name = "x", category = "Bread", priceCents = ListingValidator.MaxPriceCents + 1 } };
        yield return new object[] { "status", new { name = "x", category = "Bread", priceCents = 1, status = "Archived" } };
        yield return new object[] { "modifiers[0].id", new { name = "x", category = "Bread", priceCents = 1, modifiers = new[] { new { id = "Bad Id!", name = "m", priceDeltaCents = 0 } } } };
        yield return new object[] { "modifiers[1].id", new { name = "x", category = "Bread", priceCents = 1, modifiers = new[] { new { id = "m1", name = "a", priceDeltaCents = 0 }, new { id = "m1", name = "b", priceDeltaCents = 0 } } } };
        yield return new object[] { "modifiers[0].priceDeltaCents", new { name = "x", category = "Bread", priceCents = 1, modifiers = new[] { new { id = "m1", name = "a", priceDeltaCents = -5 } } } };
    }

    // ---- vendor writes: update ----------------------------------------------------------------

    [Fact]
    public async Task Owner_can_update_a_listing_and_changes_are_persisted()
    {
        var client = _factory.ClientFor(_vendor, "Vendor");
        var created = await CreateAsync(ValidListing(), client);

        var response = await client.PutAsJsonAsync($"/catalog/listings/{created.Id}",
            new { name = "Rye Loaf", category = "Bread", priceCents = 950, status = (string?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = (await _factory.Listings.GetAsync(created.Id, _vendor))!;
        Assert.Equal("Rye Loaf", stored.Name);
        Assert.Equal(950, stored.PriceCents);
        Assert.Equal(ListingStatuses.Draft, stored.Status); // omitted status keeps the current one
        Assert.Equal(2, stored.Version);
        Assert.Empty(stored.Modifiers); // PUT replaces the mutable fields
    }

    [Fact]
    public async Task Another_vendor_cannot_see_or_change_a_listing_and_gets_the_same_404_as_for_a_missing_one()
    {
        var owner = _factory.ClientFor(_vendor, "Vendor");
        var created = await CreateAsync(ValidListing(), owner);
        var intruder = _factory.ClientFor($"vendor-{Guid.NewGuid():N}", "Vendor");

        var attempt = await intruder.PutAsJsonAsync($"/catalog/listings/{created.Id}", ValidListing(priceCents: 1));
        var missing = await intruder.PutAsJsonAsync("/catalog/listings/listing-nope", ValidListing());

        Assert.Equal(HttpStatusCode.NotFound, attempt.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(await missing.Content.ReadAsStringAsync(), await attempt.Content.ReadAsStringAsync());
        Assert.Equal(800, (await _factory.Listings.GetAsync(created.Id, _vendor))!.PriceCents);
    }

    [Fact]
    public async Task A_suspended_vendor_can_edit_and_unpublish_but_not_publish_a_draft()
    {
        await _factory.VerifyVendorAsync(_vendor, 1);
        var client = _factory.ClientFor(_vendor, "Vendor");
        var published = await CreateAsync(ValidListing(status: "Published"), client);
        var draft = await CreateAsync(ValidListing(), client);

        await _factory.SuspendVendorAsync(_vendor, 2);

        var blocked = await client.PutAsJsonAsync($"/catalog/listings/{draft.Id}", ValidListing(status: "Published"));
        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);

        var unpublish = await client.PutAsJsonAsync($"/catalog/listings/{published.Id}", ValidListing(status: "Draft"));
        Assert.Equal(HttpStatusCode.OK, unpublish.StatusCode);
        Assert.Equal(ListingStatuses.Draft, (await _factory.Listings.GetAsync(published.Id, _vendor))!.Status);
    }

    // ---- helpers ------------------------------------------------------------------------------

    private async Task<ListingDto> CreateAsync(object body, HttpClient? client = null)
    {
        client ??= _factory.ClientFor(_vendor, "Vendor");
        var response = await client.PostAsJsonAsync("/catalog/listings", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ListingDto>())!;
    }

    private static async Task<List<T>> Drain<T>(IAsyncEnumerable<T> source)
    {
        var list = new List<T>();
        await foreach (var item in source) list.Add(item);
        return list;
    }
}
