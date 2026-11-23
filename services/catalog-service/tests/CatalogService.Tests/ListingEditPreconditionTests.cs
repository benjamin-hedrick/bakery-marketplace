using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Auth;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>
/// WI-CAT-007 requirements 1 and 2 (register 208): an edit names the edit version its form was read at in <c>If-Match</c>; a missing one is refused
/// (428), a stale one is refused (409 <c>version_mismatch</c>) and nothing is written. Reservations and adjustments never make a form stale.
/// </summary>
public sealed class ListingEditPreconditionTests : IDisposable, IAsyncLifetime
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _anon;
    private readonly HttpClient _vendor;
    private readonly HttpClient _ordering;
    private readonly string _vendorId = $"vendor-{Guid.NewGuid():N}";

    public ListingEditPreconditionTests()
    {
        _anon = _factory.CreateClient();
        _vendor = _factory.ClientFor(_vendorId, "Vendor");
        _ordering = _factory.ServiceClientFor("ordering-service", ServiceRoles.StockReserve);
    }

    public Task InitializeAsync() => _factory.VerifyVendorAsync(_vendorId);

    public Task DisposeAsync() => Task.CompletedTask;

    public void Dispose() => _factory.Dispose();

    private static object Body(int priceCents = 800, object? stock = null) => new
    {
        name = "Country Sourdough",
        category = "Bread",
        priceCents,
        status = "Published",
        stock,
    };

    private async Task<ListingDto> CreateAsync(object? stock = null)
    {
        var response = await _vendor.CreateListingAsync(Body(stock: stock));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ListingDto>())!;
    }

    private Task<HttpResponseMessage> PutAsync(string id, object body, params string[] ifMatch)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, $"/catalog/listings/{id}") { Content = JsonContent.Create(body) };
        if (ifMatch.Length > 0) request.Headers.TryAddWithoutValidation("If-Match", ifMatch);
        return _vendor.SendAsync(request);
    }

    private async Task<ListingDocument> StoredAsync(string id) => (await _factory.Listings.GetAsync(id, _vendorId))!;

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    // ---- the version in the owner's view -----------------------------------------------------------

    [Fact]
    public async Task ANewListingIsAtEditVersion1_InTheBodyAndTheETag()
    {
        var response = await _vendor.CreateListingAsync(Body());

        Assert.Equal("\"1\"", response.Headers.ETag?.Tag);
        Assert.Equal(1, (await JsonOf(response)).GetProperty("editVersion").GetInt64());

        var id = (await JsonOf(response)).GetProperty("id").GetString()!;
        var own = await _vendor.GetAsync($"/catalog/listings/mine/{id}");
        Assert.Equal("\"1\"", own.Headers.ETag?.Tag);
        Assert.Equal(1, (await JsonOf(own)).GetProperty("editVersion").GetInt64());
        var page = await JsonOf(await _vendor.GetAsync("/catalog/listings/mine"));
        Assert.Equal(1, page.GetProperty("items")[0].GetProperty("editVersion").GetInt64());
    }

    [Fact]
    public async Task ThePublicViewNeverCarriesTheEditVersion()
    {
        var created = await CreateAsync();

        foreach (var url in new[] { "/catalog/listings", $"/catalog/listings/{created.Id}" })
        {
            var response = await _anon.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.DoesNotContain("editVersion", await response.Content.ReadAsStringAsync());
            Assert.Null(response.Headers.ETag);
        }
    }

    [Fact]
    public void AListingStoredBeforeTheFieldExistedReadsAsEditVersion1()
    {
        // The Cosmos SDK reads documents with Newtonsoft; a document written before WI-CAT-007 has no editVersion.
        var old = Newtonsoft.Json.JsonConvert.DeserializeObject<ListingDocument>(
            """{"id":"listing-old","vendorId":"v","name":"Loaf","category":"Bread","priceCents":800,"status":"Published","version":7}""")!;

        Assert.Equal(1, old.EditVersion);
        Assert.Equal(7, old.Version);
    }

    // ---- the precondition ------------------------------------------------------------------------

    [Fact]
    public async Task AnEditWithTheCurrentVersionIsApplied_AndMovesTheVersionOn()
    {
        var created = await CreateAsync();

        var response = await PutAsync(created.Id, Body(priceCents: 950), "\"1\"");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("\"2\"", response.Headers.ETag?.Tag);
        Assert.Equal(2, (await JsonOf(response)).GetProperty("editVersion").GetInt64());
        var stored = await StoredAsync(created.Id);
        Assert.Equal((950, 2L), (stored.PriceCents, stored.EditVersion));
    }

    [Fact]
    public async Task AnEditWithoutIfMatchIsRefused_AndNothingIsWritten()
    {
        var created = await CreateAsync();
        var before = await StoredAsync(created.Id);

        var response = await PutAsync(created.Id, Body(priceCents: 1));

        Assert.Equal(HttpStatusCode.PreconditionRequired, response.StatusCode);
        Assert.Equal("precondition_required", (await JsonOf(response)).GetProperty("code").GetString());
        var after = await StoredAsync(created.Id);
        Assert.Equal((800, before.ETag), (after.PriceCents, after.ETag));
    }

    [Theory]
    [InlineData("*")] // "any version" would turn the check off
    [InlineData("W/\"1\"")]
    [InlineData("1")]
    [InlineData("\"\"")]
    [InlineData("\"0\"")]
    [InlineData("\"-1\"")]
    [InlineData("\"1a\"")]
    [InlineData("\"99999999999999999999\"")]
    public async Task AnIfMatchThatIsNotOneEditVersionIsRefusedAsMissing(string ifMatch)
    {
        var created = await CreateAsync();

        var response = await PutAsync(created.Id, Body(priceCents: 1), ifMatch);

        Assert.Equal(HttpStatusCode.PreconditionRequired, response.StatusCode);
        Assert.Equal(800, (await StoredAsync(created.Id)).PriceCents);
    }

    [Fact]
    public async Task MoreThanOneIfMatchValueIsRefusedAsMissing()
    {
        var created = await CreateAsync();

        var response = await PutAsync(created.Id, Body(priceCents: 1), "\"1\"", "\"2\"");

        Assert.Equal(HttpStatusCode.PreconditionRequired, response.StatusCode);
        Assert.Equal(800, (await StoredAsync(created.Id)).PriceCents);
    }

    [Fact]
    public async Task AnEditFromAStaleFormIsRefusedWithTheCurrentVersion_AndNothingIsWritten()
    {
        var created = await CreateAsync();
        Assert.Equal(HttpStatusCode.OK, (await PutAsync(created.Id, Body(priceCents: 900), "\"1\"")).StatusCode); // someone else's edit

        var stale = await PutAsync(created.Id, Body(priceCents: 1), "\"1\"");

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var body = await JsonOf(stale);
        Assert.Equal("version_mismatch", body.GetProperty("code").GetString());
        Assert.Equal(2, body.GetProperty("currentEditVersion").GetInt64());
        var stored = await StoredAsync(created.Id);
        Assert.Equal((900, 2L), (stored.PriceCents, stored.EditVersion));
    }

    [Fact]
    public async Task AVersionAheadOfTheListingIsRefusedToo()
    {
        var created = await CreateAsync();

        var response = await PutAsync(created.Id, Body(priceCents: 1), "\"5\"");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(1, (await JsonOf(response)).GetProperty("currentEditVersion").GetInt64());
    }

    [Fact]
    public async Task ConcurrentEditsFromTheSameVersion_OnlyOneIsApplied()
    {
        var created = await CreateAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(i => PutAsync(created.Id, Body(priceCents: 900 + i), "\"1\"")));

        var applied = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(responses.Where(r => r != applied), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        var winner = (await JsonOf(applied)).GetProperty("priceCents").GetInt32();
        var stored = await StoredAsync(created.Id);
        Assert.Equal((winner, 2L), (stored.PriceCents, stored.EditVersion));
    }

    [Fact]
    public async Task AReservationBetweenTheReadAndTheEditDoesNotMakeTheFormStale()
    {
        var created = await CreateAsync(new { availableQuantity = 10 });
        var formVersion = await _vendor.CurrentEditVersionAsync(created.Id);

        var reserve = await _ordering.PostAsJsonAsync("/catalog/stock/reservations", new
        {
            orderId = $"order-{Guid.NewGuid():N}",
            vendorId = _vendorId,
            lines = new[] { new { listingId = created.Id, quantity = 3 } },
        });
        Assert.Equal(HttpStatusCode.Created, reserve.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _vendor.PostAsJsonAsync($"/catalog/listings/{created.Id}/stock/adjust", new { delta = -1 })).StatusCode);

        var response = await PutAsync(created.Id, Body(priceCents: 950), EditVersionHeader.Format(formVersion));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = await StoredAsync(created.Id);
        Assert.Equal((950, 6, 2L), (stored.PriceCents, stored.AvailableQuantity, stored.EditVersion));
    }

    [Fact]
    public async Task AnAdjustmentAnswersWithTheUnchangedEditVersion()
    {
        var created = await CreateAsync(new { availableQuantity = 10 });

        var response = await _vendor.PostAsJsonAsync($"/catalog/listings/{created.Id}/stock/adjust", new { delta = 2 });

        Assert.Equal("\"1\"", response.Headers.ETag?.Tag);
        Assert.Equal(1, (await JsonOf(response)).GetProperty("editVersion").GetInt64());
    }

    // ---- the service's retry after a store conflict ------------------------------------------------

    [Fact]
    public async Task OnAStoreConflict_TheRetryLetsTheEditThroughWhenOnlyTheQuantityChanged()
    {
        var created = await CreateAsync(new { availableQuantity = 10 });
        var service = _factory.Services.GetRequiredService<ListingService>();
        var formCopy = await StoredAsync(created.Id);
        Assert.Equal(ListingOutcome.Ok, (await service.AdjustStockAsync(await StoredAsync(created.Id), -4)).Outcome); // the store's ETag moves on

        var result = await service.UpdateAsync(formCopy, 1, Request(950));

        Assert.Equal(ListingOutcome.Ok, result.Outcome);
        var stored = await StoredAsync(created.Id);
        Assert.Equal((950, 6, 2L), (stored.PriceCents, stored.AvailableQuantity, stored.EditVersion));
    }

    [Fact]
    public async Task OnAStoreConflict_TheRetryRefusesTheEditWhenAnotherEditLanded()
    {
        var created = await CreateAsync();
        var service = _factory.Services.GetRequiredService<ListingService>();
        var formCopy = await StoredAsync(created.Id);
        Assert.Equal(ListingOutcome.Ok, (await service.UpdateAsync(await StoredAsync(created.Id), 1, Request(900))).Outcome);

        var result = await service.UpdateAsync(formCopy, 1, Request(1));

        Assert.Equal(ListingOutcome.VersionMismatch, result.Outcome);
        Assert.Equal(2, result.Listing!.EditVersion);
        Assert.Equal(900, (await StoredAsync(created.Id)).PriceCents);
    }

    private static ListingRequest Request(int priceCents) =>
        new("Country Sourdough", null, "Bread", priceCents, null, null, "Published");

    // ---- who may edit is unchanged ------------------------------------------------------------------

    [Fact]
    public async Task TheRoleAndOwnershipChecksStillComeFirst()
    {
        var created = await CreateAsync();
        var other = _factory.ClientFor($"vendor-{Guid.NewGuid():N}", "Vendor");
        var customer = _factory.ClientFor("customer-1", "Customer");

        Assert.Equal(HttpStatusCode.NotFound, (await other.EditListingAsync(created.Id, Body(priceCents: 1), editVersion: 1)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.EditListingAsync(created.Id, Body(priceCents: 1), editVersion: 1)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _anon.EditListingAsync(created.Id, Body(priceCents: 1), editVersion: 1)).StatusCode);
        Assert.Equal(800, (await StoredAsync(created.Id)).PriceCents);
    }

    // ---- register 239: a stale form is a 409 whatever its stock settings say ---------------------------

    [Fact]
    public async Task AStaleFormThatDisagreesOnCountedIsAVersionMismatch_NotAValidationError()
    {
        var created = await CreateAsync(); // made to order, edit version 1
        var switched = await _vendor.EditListingAsync(created.Id, Body(stock: new { mode = "counted", availableQuantity = 5 }), editVersion: 1);
        Assert.Equal(HttpStatusCode.OK, switched.StatusCode); // another tab: now counted, edit version 2

        // The stale form (version 1) still says "counted, with a starting quantity".
        var stale = await _vendor.EditListingAsync(created.Id, Body(priceCents: 900, stock: new { mode = "counted", availableQuantity = 5 }), editVersion: 1);

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("version_mismatch", (await JsonOf(stale)).GetProperty("code").GetString());
        Assert.Equal(800, (await StoredAsync(created.Id)).PriceCents);
    }

    [Fact]
    public async Task AStaleFormThatLeavesOutTheQuantityOfANowMadeToOrderListingIsAVersionMismatch()
    {
        var created = await CreateAsync(new { mode = "counted", availableQuantity = 5 }); // counted, edit version 1
        var switched = await _vendor.EditListingAsync(created.Id, Body(stock: new { mode = "madeToOrder" }), editVersion: 1);
        Assert.Equal(HttpStatusCode.OK, switched.StatusCode); // another tab: now made to order, edit version 2

        // The stale form (version 1) says "counted" without a quantity, which a counted listing allows.
        var stale = await _vendor.EditListingAsync(created.Id, Body(priceCents: 900, stock: new { mode = "counted" }), editVersion: 1);

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("version_mismatch", (await JsonOf(stale)).GetProperty("code").GetString());
    }
}
