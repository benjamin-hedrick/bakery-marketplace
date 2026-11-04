using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CatalogService.Domain;
using CatalogService.Preferences;

namespace CatalogService.Tests;

/// <summary>
/// WI-SRCH-001 over HTTP against the real pipeline: the browse and detail views with a customer's conflicts, and the cart check. The public
/// endpoints must stay as they are (anonymous, no conflicts); these depend on who is asking, so they are separate and never cached.
/// </summary>
public sealed class PersonalizedListingApiTests : IAsyncLifetime
{
    private readonly CatalogFactory _factory = new();
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";
    private readonly string _alice = $"customer-{Guid.NewGuid():N}";
    private HttpClient _customer = null!;

    // The four listings, by id order: a-sourdough, b-croissant, c-latte, d-muffin.
    //   a: gluten; option seeds (sesame), sliced (nothing)
    //   b: gluten, dairy, tree-nut; option extra almonds (tree-nut)
    //   c: nothing marked at all
    //   d: gluten; option walnuts (tree-nut)  -> conflicts with a tree-nut allergy only through an option
    public async Task InitializeAsync()
    {
        await _factory.VerifyVendorAsync(_vendor);
        await Seed("listing-a-sourdough", ["gluten"], ("mod-seeds", ["sesame"]), ("mod-sliced", []));
        await Seed("listing-b-croissant", ["gluten", "dairy", "tree-nut"], ("mod-almonds", ["tree-nut"]));
        await Seed("listing-c-latte", []);
        await Seed("listing-d-muffin", ["gluten"], ("mod-walnuts", ["tree-nut"]));
        await _factory.SeedListingAsync(_vendor, "listing-e-draft", status: ListingStatuses.Draft);
        _customer = _factory.ClientFor(_alice, "Customer");
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    private async Task Seed(string id, string[] flags, params (string Id, string[] Allergens)[] options)
    {
        var doc = await _factory.SeedListingAsync(_vendor, id);
        doc.AllergenFlags = flags.ToList();
        doc.Modifiers = options.Select(o => new ModifierDocument { Id = o.Id, Name = o.Id, Allergens = o.Allergens.ToList() }).ToList();
        await _factory.Listings.SaveAsync(doc, _vendor);
    }

    private Task Save(string[]? allergies = null, string[]? avoid = null) =>
        _customer.PutAsJsonAsync("/catalog/preferences", new { allergies = allergies ?? [], avoid = avoid ?? [] });

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static string[] Ids(JsonElement page) => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("listing").GetProperty("id").GetString()!).ToArray();

    private static string[] Shape(JsonElement conflicts) => conflicts.EnumerateArray()
        .Select(c => $"{c.GetProperty("allergenId").GetString()}:{c.GetProperty("severity").GetString()}:{c.GetProperty("source").GetString()}:[{string.Join(",", c.GetProperty("optionIds").EnumerateArray().Select(o => o.GetString()))}]")
        .ToArray();

    private static string[] ConflictsOf(JsonElement page, string listingId) => Shape(page.GetProperty("items").EnumerateArray()
        .Single(i => i.GetProperty("listing").GetProperty("id").GetString() == listingId).GetProperty("conflicts"));

    // ---- the browse view ---------------------------------------------------------------------

    [Fact]
    public async Task Browse_lists_the_same_listings_in_the_same_order_as_the_public_endpoint_each_with_its_conflicts()
    {
        await Save(["tree-nut"], ["dairy"]);

        var mine = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me"));
        var publicPage = await JsonOf(await _factory.CreateClient().GetAsync("/catalog/listings"));

        Assert.Equal(["listing-a-sourdough", "listing-b-croissant", "listing-c-latte", "listing-d-muffin"], Ids(mine));
        Assert.Equal(publicPage.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()), Ids(mine));
        Assert.Empty(ConflictsOf(mine, "listing-a-sourdough"));
        Assert.Equal(
            ["tree-nut:allergy:item:[]", "tree-nut:allergy:option:[mod-almonds]", "dairy:avoid:item:[]"],
            ConflictsOf(mine, "listing-b-croissant"));
        Assert.Empty(ConflictsOf(mine, "listing-c-latte"));
        Assert.Equal(["tree-nut:allergy:option:[mod-walnuts]"], ConflictsOf(mine, "listing-d-muffin")); // only through an option
    }

    [Fact]
    public async Task A_listing_in_the_page_is_the_same_view_the_public_endpoint_gives()
    {
        await Save(["sesame"]);

        var mine = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?limit=1"));
        var publicPage = await JsonOf(await _factory.CreateClient().GetAsync("/catalog/listings?limit=1"));

        Assert.Equal(
            publicPage.GetProperty("items")[0].GetRawText(),
            mine.GetProperty("items")[0].GetProperty("listing").GetRawText());
        Assert.Equal(publicPage.GetProperty("nextCursor").GetString(), mine.GetProperty("nextCursor").GetString());
    }

    [Fact]
    public async Task Hiding_removes_a_listing_whose_item_conflicts_but_keeps_one_that_conflicts_only_through_an_option()
    {
        await Save(["tree-nut"]);

        var hidden = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?hideConflicts=true"));

        Assert.Equal(["listing-a-sourdough", "listing-c-latte", "listing-d-muffin"], Ids(hidden)); // b (item) gone, d (option only) kept
        Assert.Equal(["tree-nut:allergy:option:[mod-walnuts]"], ConflictsOf(hidden, "listing-d-muffin")); // and still marked
    }

    [Fact]
    public async Task Hiding_also_removes_an_item_that_conflicts_at_the_avoid_level()
    {
        await Save(avoid: ["dairy"]);

        var hidden = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?hideConflicts=true"));

        Assert.DoesNotContain("listing-b-croissant", Ids(hidden));
    }

    [Fact]
    public async Task Hiding_happens_before_paging_so_pages_stay_full_and_the_cursor_still_means_after_this_id()
    {
        await Save(["dairy"]); // hides b only

        var first = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?hideConflicts=true&limit=2"));
        var second = await JsonOf(await _customer.GetAsync($"/catalog/listings/for-me?hideConflicts=true&limit=2&after={first.GetProperty("nextCursor").GetString()}"));

        Assert.Equal(["listing-a-sourdough", "listing-c-latte"], Ids(first));   // two items, though b sits between them
        Assert.Equal("listing-c-latte", first.GetProperty("nextCursor").GetString());
        Assert.Equal(["listing-d-muffin"], Ids(second));
        Assert.Equal(JsonValueKind.Null, second.GetProperty("nextCursor").ValueKind);
    }

    [Fact]
    public async Task Paging_without_hiding_follows_the_public_cursor()
    {
        await Save(["tree-nut"]);

        var first = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?limit=3"));
        var second = await JsonOf(await _customer.GetAsync($"/catalog/listings/for-me?limit=3&after={first.GetProperty("nextCursor").GetString()}"));

        Assert.Equal(3, Ids(first).Length);
        Assert.Equal(["listing-d-muffin"], Ids(second));
    }

    [Fact]
    public async Task A_customer_without_a_profile_gets_every_listing_with_no_conflicts_and_hiding_removes_nothing()
    {
        var plain = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me"));
        var hidden = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me?hideConflicts=true"));

        Assert.Equal(4, Ids(plain).Length);
        Assert.Equal(4, Ids(hidden).Length);
        Assert.All(plain.GetProperty("items").EnumerateArray(), i => Assert.Empty(i.GetProperty("conflicts").EnumerateArray()));
    }

    [Fact]
    public async Task A_stored_listing_flag_that_is_not_an_allergen_id_is_never_matched()
    {
        var doc = (await _factory.Listings.GetAsync("listing-c-latte", _vendor))!;
        doc.AllergenFlags = ["tree nuts"]; // stored before the list was closed
        await _factory.Listings.SaveAsync(doc, _vendor);
        await Save(["tree-nut"]);

        var page = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me"));

        Assert.Empty(ConflictsOf(page, "listing-c-latte")); // not guessed at; the listing's own flags are still shown by the public view
    }

    // ---- the detail view ---------------------------------------------------------------------

    [Fact]
    public async Task Detail_returns_the_listing_with_its_conflicts_for_the_item_and_every_option()
    {
        await Save(["tree-nut", "sesame"]);

        var croissant = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me/listing-b-croissant"));
        var sourdough = await JsonOf(await _customer.GetAsync("/catalog/listings/for-me/listing-a-sourdough"));

        Assert.Equal("listing-b-croissant", croissant.GetProperty("listing").GetProperty("id").GetString());
        Assert.Equal(["tree-nut:allergy:item:[]", "tree-nut:allergy:option:[mod-almonds]"], Shape(croissant.GetProperty("conflicts")));
        Assert.Equal(["sesame:allergy:option:[mod-seeds]"], Shape(sourdough.GetProperty("conflicts")));
    }

    [Fact]
    public async Task Detail_of_a_draft_or_a_missing_listing_is_not_found_like_the_public_one()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await _customer.GetAsync("/catalog/listings/for-me/listing-e-draft")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _customer.GetAsync("/catalog/listings/for-me/listing-nope")).StatusCode);
    }

    // ---- the cart check ----------------------------------------------------------------------

    private Task<HttpResponseMessage> Check(params object[] lines) => _customer.PostAsJsonAsync("/catalog/preferences/check", new { lines });

    private static object Line(string listing, params string[] options) => new { listingId = listing, optionIds = options };

    [Fact]
    public async Task The_cart_check_counts_only_the_options_that_were_chosen()
    {
        await Save(["tree-nut"]);

        var body = await JsonOf(await Check(
            Line("listing-d-muffin"),                         // walnuts not chosen
            Line("listing-d-muffin", "mod-walnuts"),          // walnuts chosen
            Line("listing-b-croissant"),                      // the item itself contains it
            Line("listing-b-croissant", "mod-almonds"),
            Line("listing-c-latte")));

        var lines = body.GetProperty("lines").EnumerateArray().ToArray();
        Assert.Equal(5, lines.Length);
        Assert.Empty(Shape(lines[0].GetProperty("conflicts")));
        Assert.Equal(["tree-nut:allergy:option:[mod-walnuts]"], Shape(lines[1].GetProperty("conflicts")));
        Assert.Equal(["tree-nut:allergy:item:[]"], Shape(lines[2].GetProperty("conflicts")));
        Assert.Equal(["tree-nut:allergy:item:[]", "tree-nut:allergy:option:[mod-almonds]"], Shape(lines[3].GetProperty("conflicts")));
        Assert.Empty(Shape(lines[4].GetProperty("conflicts")));
        Assert.All(lines, l => Assert.True(l.GetProperty("found").GetBoolean()));
    }

    [Fact]
    public async Task The_cart_check_reports_both_severities_in_the_same_order_as_the_browse_view()
    {
        await Save(["tree-nut"], ["dairy"]);

        var body = await JsonOf(await Check(Line("listing-b-croissant")));

        Assert.Equal(["tree-nut:allergy:item:[]", "dairy:avoid:item:[]"], Shape(body.GetProperty("lines")[0].GetProperty("conflicts")));
    }

    [Fact]
    public async Task A_listing_that_is_not_public_or_an_option_that_does_not_exist_is_reported_for_its_line_not_as_a_failure()
    {
        await Save(["tree-nut"]);

        var body = await JsonOf(await Check(
            Line("listing-nope"), Line("listing-e-draft"), Line("listing-d-muffin", "mod-ghost", "mod-walnuts")));

        var lines = body.GetProperty("lines").EnumerateArray().ToArray();
        Assert.False(lines[0].GetProperty("found").GetBoolean());
        Assert.False(lines[1].GetProperty("found").GetBoolean());
        Assert.True(lines[2].GetProperty("found").GetBoolean());
        Assert.Equal(["mod-ghost"], lines[2].GetProperty("unknownOptionIds").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(["tree-nut:allergy:option:[mod-walnuts]"], Shape(lines[2].GetProperty("conflicts")));
    }

    [Fact]
    public async Task The_cart_check_with_no_profile_finds_no_conflicts_and_an_empty_cart_is_an_empty_answer()
    {
        var withLine = await JsonOf(await Check(Line("listing-b-croissant", "mod-almonds")));
        var empty = await JsonOf(await Check());

        Assert.Empty(withLine.GetProperty("lines")[0].GetProperty("conflicts").EnumerateArray());
        Assert.Empty(empty.GetProperty("lines").EnumerateArray());
    }

    [Fact]
    public async Task A_cart_that_is_too_big_or_malformed_is_refused()
    {
        var tooMany = await Check(Enumerable.Range(0, PreferenceEndpoints.MaxCartLines + 1).Select(_ => Line("listing-c-latte")).ToArray());
        var tooManyOptions = await Check(Line("listing-c-latte", Enumerable.Range(0, PreferenceEndpoints.MaxOptionsPerLine + 1).Select(i => $"o{i}").ToArray()));
        var noId = await Check(new { listingId = "", optionIds = new string[0] });
        var noLines = await _customer.PostAsync("/catalog/preferences/check", new StringContent("{}", Encoding.UTF8, "application/json"));
        var notJson = await _customer.PostAsync("/catalog/preferences/check", new StringContent("nope", Encoding.UTF8, "application/json"));
        var huge = await _customer.PostAsync("/catalog/preferences/check",
            new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes(new string(' ', PreferenceEndpoints.MaxCartBodyBytes + 1)))) { Headers = { ContentType = new("application/json") } });

        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooMany.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tooManyOptions.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, noId.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, noLines.StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, notJson.StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, huge.StatusCode);
        Assert.Contains("lines", (await JsonOf(tooMany)).GetProperty("errors").EnumerateObject().Select(p => p.Name));
    }

    // ---- who may ask, what is cached, and what stays as it was ----------------------------------

    [Fact]
    public async Task Only_a_customer_may_use_the_personalized_endpoints()
    {
        var anonymous = _factory.CreateClient();
        var vendor = _factory.ClientFor("vendor-1", "Vendor");
        var admin = _factory.ClientFor("admin-1", "Admin");

        foreach (var (client, expected) in new[] { (anonymous, HttpStatusCode.Unauthorized), (vendor, HttpStatusCode.Forbidden), (admin, HttpStatusCode.Forbidden) })
        {
            Assert.Equal(expected, (await client.GetAsync("/catalog/listings/for-me")).StatusCode);
            Assert.Equal(expected, (await client.GetAsync("/catalog/listings/for-me/listing-a-sourdough")).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/catalog/preferences/check", new { lines = new object[0] })).StatusCode);
        }
    }

    [Fact]
    public async Task A_customer_only_ever_gets_conflicts_from_their_own_profile()
    {
        await Save(["tree-nut"]);
        var bob = _factory.ClientFor($"customer-{Guid.NewGuid():N}", "Customer");

        var page = await JsonOf(await bob.GetAsync("/catalog/listings/for-me"));
        var check = await JsonOf(await bob.PostAsJsonAsync("/catalog/preferences/check", new { lines = new[] { Line("listing-b-croissant") } }));

        Assert.All(page.GetProperty("items").EnumerateArray(), i => Assert.Empty(i.GetProperty("conflicts").EnumerateArray()));
        Assert.Empty(check.GetProperty("lines")[0].GetProperty("conflicts").EnumerateArray());
    }

    [Fact]
    public async Task Every_personalized_response_is_private_and_not_stored_by_any_cache()
    {
        await Save(["tree-nut"]);
        var responses = new[]
        {
            await _customer.GetAsync("/catalog/listings/for-me"),
            await _customer.GetAsync("/catalog/listings/for-me/listing-b-croissant"),
            await _customer.GetAsync("/catalog/listings/for-me/listing-nope"),
            await Check(Line("listing-b-croissant")),
            await _customer.PostAsync("/catalog/preferences/check", new StringContent("nope", Encoding.UTF8, "application/json")),
        };

        foreach (var r in responses)
            Assert.Equal("no-store, private", string.Join(", ", r.Headers.CacheControl!.ToString().Split(", ").Order()));
    }

    [Fact]
    public async Task The_public_endpoints_are_unchanged_anonymous_and_with_no_conflicts_field()
    {
        await Save(["tree-nut"]);
        var anonymous = _factory.CreateClient();

        var list = await anonymous.GetAsync("/catalog/listings");
        var one = await anonymous.GetAsync("/catalog/listings/listing-b-croissant");

        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        Assert.DoesNotContain("conflicts", await list.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("conflicts", await one.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        Assert.Null(list.Headers.CacheControl?.Private);
        Assert.False(list.Headers.CacheControl?.NoStore ?? false);
    }

    [Fact]
    public async Task A_public_listing_whose_id_is_for_me_is_not_confused_with_the_personalized_route()
    {
        // The literal route wins over the {id} route, so the public detail of an id that happens to match nothing stays a plain 404.
        var response = await _factory.CreateClient().GetAsync("/catalog/listings/for-me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode); // the personalized browse asking for a login, not a missing listing
    }

    // ---- the profile stays private ------------------------------------------------------------------

    [Fact]
    public async Task Nothing_of_a_profile_or_its_conflicts_reaches_a_log_line_or_a_span()
    {
        using var probe = new PrivacyProbe();
        using var app = probe.Attach(_factory);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token(_alice, "Customer"));

        await client.PutAsJsonAsync("/catalog/preferences", new { allergies = new[] { "tree-nut", "sesame" }, avoid = new[] { "dairy" } });
        await client.GetAsync("/catalog/listings/for-me");
        await client.GetAsync("/catalog/listings/for-me?hideConflicts=true");
        await client.GetAsync("/catalog/listings/for-me/listing-b-croissant");
        await client.PostAsJsonAsync("/catalog/preferences/check", new { lines = new[] { Line("listing-b-croissant", "mod-almonds") } });
        await client.PostAsJsonAsync("/catalog/preferences/check", new { lines = new[] { Line("listing-nope", "tree-nut") } });

        probe.AssertNothingOf("tree-nut", "sesame", "dairy", "allergy");
    }
}
