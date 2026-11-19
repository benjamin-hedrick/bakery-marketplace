using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>
/// WI-CAT-007 requirement 5 (open point 5): <c>POST /catalog/listings</c> needs an <c>Idempotency-Key</c>; the listing id is a hash of the vendor and
/// the key, the write is create-only, a repeat answers 200 with the listing as it is now, and the key used for another request is refused.
/// </summary>
public sealed class ListingIdempotentCreateTests : IDisposable, IAsyncLifetime
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _vendor;
    private readonly string _vendorId = $"vendor-{Guid.NewGuid():N}";

    public ListingIdempotentCreateTests() => _vendor = _factory.ClientFor(_vendorId, "Vendor");

    public Task InitializeAsync() => _factory.VerifyVendorAsync(_vendorId);

    public Task DisposeAsync() => Task.CompletedTask;

    public void Dispose() => _factory.Dispose();

    private static object Body(int priceCents = 800, string status = "Published", string name = "Country Sourdough") =>
        new { name, category = "Bread", priceCents, status };

    private Task<HttpResponseMessage> PostAsync(object body, params string[] keys)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/catalog/listings") { Content = JsonContent.Create(body) };
        if (keys.Length > 0) request.Headers.TryAddWithoutValidation(ListingEndpoints.IdempotencyKeyHeader, keys);
        return _vendor.SendAsync(request);
    }

    private async Task<List<ListingDocument>> StoredAsync(string? vendorId = null) =>
        await _factory.Listings.QueryAsync(vendorId ?? _vendorId, q => q.Where(l => l.DocType == ListingDocument.Kind)).ToListAsync();

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    // ---- the key ---------------------------------------------------------------------------------

    [Fact]
    public async Task ACreateWithoutAKeyIsRefused_AndNothingIsStored()
    {
        var response = await PostAsync(Body());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("validation_failed", body.GetProperty("code").GetString());
        Assert.True(body.GetProperty("errors").TryGetProperty("idempotencyKey", out _));
        Assert.Empty(await StoredAsync());
    }

    public static IEnumerable<object[]> MalformedKeys() =>
    [
        [""],
        ["two words"],
        [new string('k', ListingValidator.MaxIdempotencyKeyLength + 1)],
    ];

    [Theory]
    [MemberData(nameof(MalformedKeys))]
    public async Task AMalformedKeyIsRefused_WithoutRepeatingIt(string key)
    {
        var response = await PostAsync(Body(), key);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty("idempotencyKey", out _));
        if (key.Length > 0) Assert.DoesNotContain(key, await response.Content.ReadAsStringAsync());
        Assert.Empty(await StoredAsync());
    }

    [Fact]
    public async Task MoreThanOneKeyIsRefused()
    {
        var response = await PostAsync(Body(), "key-a", "key-b");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Empty(await StoredAsync());
    }

    [Theory]
    [InlineData("k")]
    [InlineData("<script>alert(1)</script>")] // visible ASCII is a valid key; it is hashed, never stored or echoed
    public async Task AKeyAtTheLimitsIsAccepted_AndNeverAppearsInTheIdOrTheAnswer(string key)
    {
        var response = await PostAsync(Body(), key);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var stored = Assert.Single(await StoredAsync());
        Assert.Equal(ListingService.ListingIdFor(_vendorId, key), stored.Id);
        if (key.Length == 1) return; // one letter is in any answer; the longer key shows nothing echoes it
        Assert.DoesNotContain(key, await response.Content.ReadAsStringAsync());
        Assert.DoesNotContain(key, response.Headers.Location!.ToString());
        Assert.DoesNotContain(key, JsonSerializer.Serialize(stored));
    }

    [Fact]
    public async Task AKeyOfTheMaximumLengthIsAccepted()
    {
        var response = await PostAsync(Body(), new string('k', ListingValidator.MaxIdempotencyKeyLength));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task AMissingKeyAndAnInvalidBodyAreReportedTogether()
    {
        var response = await PostAsync(new { category = "Bread", priceCents = -1 });

        var errors = (await JsonOf(response)).GetProperty("errors");
        Assert.True(errors.TryGetProperty("idempotencyKey", out _));
        Assert.True(errors.TryGetProperty("name", out _));
        Assert.True(errors.TryGetProperty("priceCents", out _));
    }

    [Theory]
    [InlineData("été")] // not ASCII
    [InlineData("tab\there")]
    [InlineData("line\nbreak")]
    public void AKeyOutsideVisibleAsciiIsMalformed(string key) =>
        Assert.True(ListingValidator.ValidateIdempotencyKey(key).ContainsKey("idempotencyKey"));

    // ---- a repeat and a reuse -----------------------------------------------------------------------

    [Fact]
    public async Task ARepeatOfTheSameCreateAnswersTheSameListing_AndStoresNothingNew()
    {
        var key = ListingWrites.NewKey();
        var first = await PostAsync(Body(), key);
        var repeat = await PostAsync(Body(), key);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        Assert.Equal("\"1\"", repeat.Headers.ETag?.Tag);
        Assert.Equal((await JsonOf(first)).GetProperty("id").GetString(), (await JsonOf(repeat)).GetProperty("id").GetString());
        Assert.Single(await StoredAsync());
    }

    [Fact]
    public async Task ARepeatAfterAnEditAnswersTheListingAsItIsNow()
    {
        var key = ListingWrites.NewKey();
        var id = (await JsonOf(await PostAsync(Body(), key))).GetProperty("id").GetString()!;
        Assert.Equal(HttpStatusCode.OK, (await _vendor.EditListingAsync(id, Body(priceCents: 950))).StatusCode);

        var repeat = await PostAsync(Body(), key);

        Assert.Equal(HttpStatusCode.OK, repeat.StatusCode);
        var body = await JsonOf(repeat);
        Assert.Equal((950, 2L), (body.GetProperty("priceCents").GetInt32(), body.GetProperty("editVersion").GetInt64()));
    }

    [Fact]
    public async Task TheSameKeyWithAnotherRequestIsRefused_AndChangesNothing()
    {
        var key = ListingWrites.NewKey();
        Assert.Equal(HttpStatusCode.Created, (await PostAsync(Body(), key)).StatusCode);

        var reuse = await PostAsync(Body(priceCents: 1), key);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, reuse.StatusCode);
        Assert.Equal("idempotency_key_reuse", (await JsonOf(reuse)).GetProperty("code").GetString());
        Assert.Equal(800, Assert.Single(await StoredAsync()).PriceCents);
    }

    [Fact]
    public async Task TwoVendorsMayUseTheSameKey()
    {
        var other = $"vendor-{Guid.NewGuid():N}";
        await _factory.VerifyVendorAsync(other);
        const string key = "shared-key";

        var mine = await PostAsync(Body(), key);
        var theirs = await _factory.ClientFor(other, "Vendor").CreateListingAsync(Body(), key);

        Assert.Equal((HttpStatusCode.Created, HttpStatusCode.Created), (mine.StatusCode, theirs.StatusCode));
        Assert.NotEqual(Assert.Single(await StoredAsync()).Id, Assert.Single(await StoredAsync(other)).Id);
    }

    [Fact]
    public async Task ConcurrentCreatesWithOneKeyMakeOneListing_AndOneEvent()
    {
        var published = new List<DomainEventEnvelope<ListingPublishedPayload>>();
        await _factory.Services.GetRequiredService<IEventSubscriber>()
            .SubscribeAsync<ListingPublishedPayload>("ListingPublished", (e, _) => { lock (published) published.Add(e); return Task.CompletedTask; });
        var key = ListingWrites.NewKey();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => PostAsync(Body(), key)));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Equal(9, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var stored = Assert.Single(await StoredAsync());
        foreach (var r in responses) Assert.Equal(stored.Id, (await JsonOf(r)).GetProperty("id").GetString());
        Assert.Single(published, e => e.Payload.ListingId == stored.Id);
    }

    [Fact]
    public async Task TheFingerprintIsStoredAndNeverReturned()
    {
        var created = await PostAsync(Body(), ListingWrites.NewKey());
        var id = (await JsonOf(created)).GetProperty("id").GetString()!;
        var fingerprint = Assert.Single(await StoredAsync()).RequestFingerprint;
        Assert.False(string.IsNullOrEmpty(fingerprint));

        var answers = new[]
        {
            await created.Content.ReadAsStringAsync(),
            await _vendor.GetStringAsync($"/catalog/listings/mine/{id}"),
            await _vendor.GetStringAsync("/catalog/listings/mine"),
            await _factory.CreateClient().GetStringAsync($"/catalog/listings/{id}"),
        };
        Assert.All(answers, a => Assert.DoesNotContain(fingerprint!, a));
        Assert.All(answers, a => Assert.DoesNotContain("ingerprint", a));
    }

    [Fact]
    public async Task ARepeatOfAnUnverifiedVendorsRefusedCreateIsStillRefused()
    {
        var unverified = _factory.ClientFor($"vendor-{Guid.NewGuid():N}", "Vendor");
        var key = ListingWrites.NewKey();

        var first = await unverified.CreateListingAsync(Body(), key);
        var again = await unverified.CreateListingAsync(Body(), key);

        Assert.Equal((HttpStatusCode.Conflict, HttpStatusCode.Conflict), (first.StatusCode, again.StatusCode));
        Assert.Equal("vendor_not_verified", (await JsonOf(again)).GetProperty("code").GetString());
    }
}
