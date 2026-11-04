using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CatalogService.Preferences;
using CatalogService.Tags;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>
/// WI-PREF-001 over HTTP against the real service pipeline: the customer's allergen profile. It is quasi-health data (NFR 3.7), so besides the
/// behaviour these tests hold the abuse cases of the spec: another customer's profile cannot be named, only a customer may use it, bad ids are
/// refused by name, a large body is refused, and nothing of a profile reaches a log line or a span.
/// </summary>
public sealed class PreferenceApiTests : IDisposable
{
    private const string Registry = """
        { "tags": [
          { "id": "dairy", "kind": "allergen", "label": "Milk (dairy)", "sortOrder": 10 },
          { "id": "tree-nut", "kind": "allergen", "label": "Tree nuts", "sortOrder": 20 },
          { "id": "sesame", "kind": "allergen", "label": "Sesame", "sortOrder": 30 },
          { "id": "old-allergen", "kind": "allergen", "label": "Old", "retired": true },
          { "id": "winter-allergen", "kind": "allergen", "label": "Winter", "activeFrom": "2030-01-01" },
          { "id": "vegan", "kind": "diet", "label": "Vegan" },
          { "id": "staff-pick", "kind": "theme", "label": "Staff pick", "visibility": "hidden", "assignableBy": "platform" }
        ] }
        """;

    private readonly CatalogFactory _factory = new();
    private readonly string _alice = $"customer-{Guid.NewGuid():N}";
    private readonly string _bob = $"customer-{Guid.NewGuid():N}";

    public void Dispose() => _factory.Dispose();

    private HttpClient Customer(string sub) => _factory.ClientFor(sub, "Customer");

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static string[] List(JsonElement body, string name) => body.GetProperty(name).EnumerateArray().Select(e => e.GetString()!).ToArray();

    private static object Profile(string[]? allergies = null, string[]? avoid = null) => new { allergies = allergies ?? [], avoid = avoid ?? [] };

    private WebApplicationFactory<Program> WithRegistry() => _factory.WithWebHostBuilder(b => b.ConfigureServices(services =>
    {
        services.RemoveAll<ITagRegistry>();
        services.AddSingleton<ITagRegistry>(TagRegistry.Parse(Registry));
        services.RemoveAll<TimeProvider>();
        services.AddSingleton<TimeProvider>(new TagApiTestsClock());
    }));

    private sealed class TagApiTestsClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 11, 3, 12, 0, 0, TimeSpan.Zero);
    }

    // ---- reading and writing ---------------------------------------------------------------

    [Fact]
    public async Task A_customer_with_no_profile_gets_two_empty_lists_not_an_error()
    {
        var response = await Customer(_alice).GetAsync("/catalog/preferences");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Empty(List(body, "allergies"));
        Assert.Empty(List(body, "avoid"));
        Assert.Equal(JsonValueKind.Null, body.GetProperty("updatedAt").ValueKind);
    }

    [Fact]
    public async Task The_first_save_creates_the_profile_and_a_read_returns_it()
    {
        var put = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut", "sesame"], ["dairy"]));
        var get = await Customer(_alice).GetAsync("/catalog/preferences");

        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        var body = await JsonOf(get);
        Assert.Equal(["tree-nut", "sesame"], List(body, "allergies"));
        Assert.Equal(["dairy"], List(body, "avoid"));
        Assert.NotEqual(JsonValueKind.Null, body.GetProperty("updatedAt").ValueKind);
    }

    [Fact]
    public async Task A_save_replaces_both_lists_and_saving_the_same_thing_again_changes_nothing()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"], ["dairy"]));
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["sesame"]));
        var again = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["sesame"]));

        var body = await JsonOf(again);
        Assert.Equal(["sesame"], List(body, "allergies"));
        Assert.Empty(List(body, "avoid"));
    }

    [Fact]
    public async Task Saving_two_empty_lists_clears_the_profile()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"]));

        var cleared = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile());
        var body = await JsonOf(await Customer(_alice).GetAsync("/catalog/preferences"));

        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        Assert.Empty(List(body, "allergies"));
        Assert.Empty(List(body, "avoid"));
    }

    [Fact]
    public async Task Both_responses_are_private_and_not_stored_by_any_cache()
    {
        var get = await Customer(_alice).GetAsync("/catalog/preferences");
        var put = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["sesame"]));
        var refused = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["nuts"]));

        foreach (var r in new[] { get, put, refused })
            Assert.Equal("no-store, private", string.Join(", ", r.Headers.CacheControl!.ToString().Split(", ").Order()));
    }

    // ---- whose profile it is ---------------------------------------------------------------

    [Fact]
    public async Task One_customers_profile_is_never_another_customers()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"], ["dairy"]));

        var bobSees = await JsonOf(await Customer(_bob).GetAsync("/catalog/preferences"));
        await Customer(_bob).PutAsJsonAsync("/catalog/preferences", Profile(["sesame"]));
        var aliceStill = await JsonOf(await Customer(_alice).GetAsync("/catalog/preferences"));

        Assert.Empty(List(bobSees, "allergies"));
        Assert.Equal(["tree-nut"], List(aliceStill, "allergies"));
        Assert.Equal(["dairy"], List(aliceStill, "avoid"));
    }

    [Fact]
    public async Task A_customer_id_in_the_path_or_the_body_or_the_query_names_nobody()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"]));

        var byPath = await Customer(_bob).GetAsync($"/catalog/preferences/{_alice}");
        var byQuery = await JsonOf(await Customer(_bob).GetAsync($"/catalog/preferences?customerId={_alice}"));
        var put = await Customer(_bob).PutAsJsonAsync("/catalog/preferences", new { customerId = _alice, allergies = new[] { "sesame" }, avoid = Array.Empty<string>() });
        var aliceStill = await JsonOf(await Customer(_alice).GetAsync("/catalog/preferences"));

        Assert.Equal(HttpStatusCode.NotFound, byPath.StatusCode);
        Assert.Empty(List(byQuery, "allergies"));
        Assert.Equal(HttpStatusCode.OK, put.StatusCode); // saved as Bob's own; the extra field is ignored
        Assert.Equal(["tree-nut"], List(aliceStill, "allergies"));
    }

    [Fact]
    public async Task Only_a_customer_may_use_the_profile()
    {
        var anonymous = _factory.CreateClient();
        var vendor = _factory.ClientFor("vendor-1", "Vendor");
        var admin = _factory.ClientFor("admin-1", "Admin");

        foreach (var (client, expected) in new[] { (anonymous, HttpStatusCode.Unauthorized), (vendor, HttpStatusCode.Forbidden), (admin, HttpStatusCode.Forbidden) })
        {
            Assert.Equal(expected, (await client.GetAsync("/catalog/preferences")).StatusCode);
            Assert.Equal(expected, (await client.PutAsJsonAsync("/catalog/preferences", Profile(["sesame"]))).StatusCode);
        }
    }

    // ---- what is accepted ----------------------------------------------------------------------

    [Fact]
    public async Task An_id_that_is_not_an_allergen_on_offer_today_is_refused_by_name_and_nothing_is_saved()
    {
        using var app = WithRegistry();
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token(_alice, "Customer"));

        // unknown, wrong spelling of a known one, a diet tag, a hidden tag, a retired allergen, an allergen not yet active
        foreach (var bad in new[] { "nuts", "tree-nuts", "Tree-Nut", "vegan", "staff-pick", "old-allergen", "winter-allergen" })
        {
            var response = await client.PutAsJsonAsync("/catalog/preferences", Profile([bad]));

            Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
            var errors = (await JsonOf(response)).GetProperty("errors");
            Assert.Contains($"'{bad}'", errors.GetProperty("allergies")[0].GetString());
        }
        Assert.Empty(List(await JsonOf(await client.GetAsync("/catalog/preferences")), "allergies"));
    }

    [Fact]
    public async Task A_refusal_lists_the_allergens_that_are_on_offer_and_names_the_list_that_failed()
    {
        var response = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(avoid: ["nuts"]));

        var errors = (await JsonOf(response)).GetProperty("errors");
        Assert.False(errors.TryGetProperty("allergies", out _));
        var message = errors.GetProperty("avoid")[0].GetString()!;
        Assert.Contains("dairy", message);
        Assert.Contains("sesame", message);
    }

    [Fact]
    public async Task A_duplicate_and_an_allergen_in_both_lists_are_refused_not_quietly_merged()
    {
        var duplicate = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["sesame", "sesame"]));
        var both = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["sesame"], ["sesame", "dairy"]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, duplicate.StatusCode);
        Assert.Contains("more than once", (await JsonOf(duplicate)).GetProperty("errors").GetProperty("allergies")[0].GetString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, both.StatusCode);
        Assert.Contains("one or the other", (await JsonOf(both)).GetProperty("errors").GetProperty("avoid")[0].GetString());
    }

    [Fact]
    public async Task A_missing_list_is_refused_so_a_partial_body_cannot_clear_a_profile_by_accident()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"]));

        var onlyAvoid = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", new { avoid = new[] { "dairy" } });
        var nothing = await Customer(_alice).PutAsync("/catalog/preferences", new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, onlyAvoid.StatusCode);
        Assert.Contains("allergies", (await JsonOf(onlyAvoid)).GetProperty("errors").EnumerateObject().Select(p => p.Name));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, nothing.StatusCode);
        Assert.Equal(["tree-nut"], List(await JsonOf(await Customer(_alice).GetAsync("/catalog/preferences")), "allergies"));
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("")]
    [InlineData("[1,2,3]")]
    [InlineData("{\"allergies\": [1, 2], \"avoid\": []}")]
    [InlineData("{\"allergies\": \"sesame\", \"avoid\": []}")]
    [InlineData("{\"allergies\": [null], \"avoid\": []}")]
    public async Task A_body_that_is_not_the_expected_json_is_refused_without_being_echoed(string body)
    {
        var response = await Customer(_alice).PutAsync("/catalog/preferences", new StringContent(body, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        if (body.Length > 0) Assert.DoesNotContain(body, text);
    }

    [Fact]
    public async Task A_large_body_is_refused_whether_or_not_its_length_is_declared()
    {
        var big = "{\"allergies\": [" + string.Join(",", Enumerable.Repeat("\"sesame\"", 1000)) + "], \"avoid\": []}";
        Assert.True(big.Length > PreferenceEndpoints.MaxBodyBytes);

        var declared = await Customer(_alice).PutAsync("/catalog/preferences", new StringContent(big, Encoding.UTF8, "application/json"));
        var undeclared = await Customer(_alice).PutAsync("/catalog/preferences",
            new StreamContent(new MemoryStream(Encoding.UTF8.GetBytes(big))) { Headers = { ContentType = new("application/json") } });

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, declared.StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, undeclared.StatusCode);
    }

    [Fact]
    public async Task A_value_echoed_in_a_refusal_is_shortened()
    {
        var response = await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile([new string('x', 500)]));

        var message = (await JsonOf(response)).GetProperty("errors").GetProperty("allergies")[0].GetString()!;
        Assert.DoesNotContain(new string('x', 100), message);
    }

    // ---- the profile stays private -----------------------------------------------------------------

    [Fact]
    public async Task Nothing_of_a_profile_reaches_a_log_line_or_a_span()
    {
        using var probe = new PrivacyProbe();
        using var app = probe.Attach(_factory);
        var client = app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.Token(_alice, "Customer"));

        await client.PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut", "sesame"], ["dairy"]));
        await client.GetAsync("/catalog/preferences");
        await client.PutAsJsonAsync("/catalog/preferences", Profile(["nuts"]));       // a refusal
        await client.PutAsync("/catalog/preferences", new StringContent("{\"allergies\": [\"tree-nut\"", Encoding.UTF8, "application/json")); // malformed

        probe.AssertNothingOf("tree-nut", "sesame", "dairy", "nuts");
    }

    // ---- inside the catalog -----------------------------------------------------------------------------

    [Fact]
    public async Task The_catalog_reads_a_profile_through_the_reader_and_an_unknown_customer_has_the_empty_one()
    {
        await Customer(_alice).PutAsJsonAsync("/catalog/preferences", Profile(["tree-nut"], ["dairy"]));
        var reader = _factory.Services.GetRequiredService<IPreferenceReader>();

        var alice = await reader.GetAsync(_alice);
        var nobody = await reader.GetAsync("customer-nobody");

        Assert.Equal(["tree-nut"], alice.Allergies);
        Assert.Equal(["dairy"], alice.Avoid);
        Assert.Empty(nobody.Allergies);
        Assert.Empty(nobody.Avoid);
        Assert.Null(nobody.UpdatedAt);
    }
}
