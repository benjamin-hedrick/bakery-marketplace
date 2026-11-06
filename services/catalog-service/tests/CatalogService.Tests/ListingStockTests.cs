using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using BakeryMarketplace.Seed;
using CatalogService.Api;
using CatalogService.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>WI-CAT-005 / ADR-0017: stock fields, vendor set and adjust, the public stock status, and the low-stock event.</summary>
public sealed class ListingStockTests : IDisposable
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _anon;
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";

    public ListingStockTests() => _anon = _factory.CreateClient();

    public void Dispose() => _factory.Dispose();

    private static object Body(object? stock = null, string status = "Published", int priceCents = 800) => new
    {
        name = "Country Sourdough",
        category = "Bread",
        priceCents,
        status,
        stock,
    };

    private static object Stock(int? quantity, int? maxPerOrder = null, int? threshold = null) =>
        new { availableQuantity = quantity, maxPerOrder, lowStockThreshold = threshold };

    private async Task<HttpClient> VerifiedVendorAsync(string? vendorId = null)
    {
        vendorId ??= _vendor;
        await _factory.VerifyVendorAsync(vendorId);
        return _factory.ClientFor(vendorId, "Vendor");
    }

    private static async Task<ListingDto> ReadAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<ListingDto>())!;
    }

    private static async Task<ListingDto> CreateAsync(HttpClient vendor, object body) =>
        await ReadAsync(await vendor.PostAsJsonAsync("/catalog/listings", body));

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static Task<HttpResponseMessage> Adjust(HttpClient vendor, string id, object? delta) =>
        vendor.PostAsJsonAsync($"/catalog/listings/{id}/stock/adjust", new { delta });

    // ---- status mapping (pure) ---------------------------------------------------------------

    [Theory]
    [InlineData(null, null, StockStatuses.InStock)] // made to order
    [InlineData(100, null, StockStatuses.InStock)]
    [InlineData(6, null, StockStatuses.InStock)] // just above the default threshold of 5
    [InlineData(5, null, StockStatuses.Low)]
    [InlineData(1, null, StockStatuses.Low)]
    [InlineData(0, null, StockStatuses.SoldOut)]
    [InlineData(8, 10, StockStatuses.Low)] // custom threshold
    [InlineData(11, 10, StockStatuses.InStock)]
    [InlineData(1, 0, StockStatuses.InStock)] // threshold 0: low only when sold out
    [InlineData(0, 0, StockStatuses.SoldOut)]
    public void StatusFollowsQuantityAndThreshold(int? quantity, int? threshold, string expected)
    {
        var doc = new ListingDocument { AvailableQuantity = quantity, LowStockThreshold = threshold };

        Assert.Equal(expected, StockPolicy.StatusOf(doc));
    }

    // ---- public view -------------------------------------------------------------------------

    [Fact]
    public async Task PublicReadsShowTheStatusAndMaxPerOrder_NeverTheCount()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 3, maxPerOrder: 2, threshold: 5)));

        foreach (var url in new[] { "/catalog/listings", $"/catalog/listings/{created.Id}" })
        {
            var raw = await _anon.GetStringAsync(url);

            Assert.Contains("\"low\"", raw);
            Assert.Contains("\"maxPerOrder\":2", raw);
            Assert.DoesNotContain("availableQuantity", raw);
            Assert.DoesNotContain("lowStockThreshold", raw);
        }
    }

    [Fact]
    public async Task ASoldOutListingStaysVisibleAsSoldOut_AndMadeToOrderIsAlwaysInStock()
    {
        var vendor = await VerifiedVendorAsync();
        var soldOut = await CreateAsync(vendor, Body(Stock(quantity: 0)));
        var madeToOrder = await CreateAsync(vendor, Body());

        var page = (await _anon.GetFromJsonAsync<ListingPage>("/catalog/listings"))!;

        Assert.Equal(StockStatuses.SoldOut, page.Items.Single(i => i.Id == soldOut.Id).Stock.Status);
        Assert.Equal(StockStatuses.InStock, page.Items.Single(i => i.Id == madeToOrder.Id).Stock.Status);
    }

    [Fact]
    public async Task TheOwnersResponsesIncludeTheCount_AndOmitItForMadeToOrder()
    {
        var vendor = await VerifiedVendorAsync();

        var limited = await JsonOf(await vendor.PostAsJsonAsync("/catalog/listings", Body(Stock(quantity: 12, threshold: 3))));
        var made = await JsonOf(await vendor.PostAsJsonAsync("/catalog/listings", Body()));

        Assert.Equal(12, limited.GetProperty("stock").GetProperty("availableQuantity").GetInt32());
        Assert.Equal(3, limited.GetProperty("stock").GetProperty("lowStockThreshold").GetInt32());
        Assert.False(made.GetProperty("stock").TryGetProperty("availableQuantity", out _)); // absent = made to order
    }

    // ---- edits -------------------------------------------------------------------------------

    [Fact]
    public async Task AnEditWithoutAStockBlockLeavesStockAlone()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 7, maxPerOrder: 3)));

        var edited = await ReadAsync(await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(priceCents: 950)));

        Assert.Equal(950, edited.PriceCents);
        Assert.Equal(7, edited.Stock.AvailableQuantity);
        Assert.Equal(3, edited.Stock.MaxPerOrder);
    }

    [Fact]
    public async Task AStockBlockReplacesAllStockSettings_AndAMissingQuantityMeansMadeToOrder()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 7, maxPerOrder: 3, threshold: 2)));

        var replaced = await ReadAsync(await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(Stock(quantity: 20))));
        Assert.Equal(20, replaced.Stock.AvailableQuantity);
        Assert.Null(replaced.Stock.MaxPerOrder);
        Assert.Null(replaced.Stock.LowStockThreshold);

        var madeToOrder = await ReadAsync(await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(Stock(quantity: null, maxPerOrder: 5))));
        Assert.Null(madeToOrder.Stock.AvailableQuantity);
        Assert.Equal(StockStatuses.InStock, madeToOrder.Stock.Status);
        Assert.Equal(5, madeToOrder.Stock.MaxPerOrder);
    }

    public static IEnumerable<object[]> InvalidStock() =>
    [
        ["stock.availableQuantity", new { availableQuantity = -1 }],
        ["stock.availableQuantity", new { availableQuantity = StockPolicy.MaxQuantity + 1 }],
        ["stock.maxPerOrder", new { availableQuantity = 5, maxPerOrder = 0 }],
        ["stock.lowStockThreshold", new { availableQuantity = 5, lowStockThreshold = -1 }],
    ];

    [Theory]
    [MemberData(nameof(InvalidStock))]
    public async Task InvalidStockIsRejectedWithAFieldError_AndNothingIsStored(string field, object stock)
    {
        var vendor = await VerifiedVendorAsync();

        var response = await vendor.PostAsJsonAsync("/catalog/listings", Body(stock));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty(field, out _), field);
        Assert.Empty(await _factory.Listings.QueryAsync(_vendor, q => q).ToListAsync());
    }

    // ---- adjust ------------------------------------------------------------------------------

    [Fact]
    public async Task AdjustIncrementsAndDecrements()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 10)));

        var up = await ReadAsync(await Adjust(vendor, created.Id, 5));
        var down = await ReadAsync(await Adjust(vendor, created.Id, -12));

        Assert.Equal(15, up.Stock.AvailableQuantity);
        Assert.Equal(3, down.Stock.AvailableQuantity);
        Assert.Equal(StockStatuses.Low, down.Stock.Status);
        Assert.Equal(3, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task AdjustCannotGoBelowZero_AndChangesNothing()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 2)));

        var response = await Adjust(vendor, created.Id, -3);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("insufficient_stock", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Equal(2, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task AdjustOnAMadeToOrderListingIsRefused()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body());

        var response = await Adjust(vendor, created.Id, 5);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("made_to_order", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Null((await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(StockPolicy.MaxQuantity + 1)]
    [InlineData(-StockPolicy.MaxQuantity - 1)]
    public async Task AdjustNeedsANonZeroDeltaWithinBounds(int? delta)
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 10)));

        var response = await Adjust(vendor, created.Id, delta);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal(10, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task AdjustCannotPushTheQuantityPastTheMaximum()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: StockPolicy.MaxQuantity - 1)));

        var response = await Adjust(vendor, created.Id, 5);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task OnlyTheOwnerCanAdjust()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 10)));
        var otherVendor = await VerifiedVendorAsync($"vendor-{Guid.NewGuid():N}");
        var customer = _factory.ClientFor("customer-1", "Customer");

        Assert.Equal(HttpStatusCode.NotFound, (await Adjust(otherVendor, created.Id, -1)).StatusCode); // another vendor's listing looks missing
        Assert.Equal(HttpStatusCode.Forbidden, (await Adjust(customer, created.Id, -1)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Adjust(_anon, created.Id, -1)).StatusCode);
        Assert.Equal(10, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task AdjustingAMissingListingIsNotFound()
    {
        var vendor = await VerifiedVendorAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await Adjust(vendor, "listing-nope", 1)).StatusCode);
    }

    // ---- concurrency -------------------------------------------------------------------------

    [Fact]
    public async Task ConcurrentIncrementsAreAllApplied()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 0)));

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Adjust(vendor, created.Id, 1)));

        Assert.All(results, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(10, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task TheLastUnitsCanBeTakenOnlyOnce_NoOversell()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 3)));

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Adjust(vendor, created.Id, -1)));

        Assert.Equal(3, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(7, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, (await _factory.Listings.GetAsync(created.Id, _vendor))!.AvailableQuantity);
    }

    [Fact]
    public async Task AnEditRacingWithAdjustmentsDoesNotLoseThem()
    {
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 100)));

        var adjusts = Enumerable.Range(0, 10).Select(_ => Adjust(vendor, created.Id, -1));
        var edits = Enumerable.Range(0, 10).Select(i => vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(priceCents: 900 + i)));
        var responses = await Task.WhenAll(adjusts.Concat(edits));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        var stored = (await _factory.Listings.GetAsync(created.Id, _vendor))!;
        Assert.Equal(90, stored.AvailableQuantity); // an edit that names no stock block keeps the counter
        Assert.InRange(stored.PriceCents, 900, 909);
    }

    // ---- LowStockDetected ----------------------------------------------------------------------

    private async Task<List<DomainEventEnvelope<LowStockDetectedPayload>>> SubscribeToLowStockAsync()
    {
        var events = new List<DomainEventEnvelope<LowStockDetectedPayload>>();
        await _factory.Services.GetRequiredService<IEventSubscriber>().SubscribeAsync<LowStockDetectedPayload>(
            "LowStockDetected", (e, _) => { events.Add(e); return Task.CompletedTask; });
        return events;
    }

    [Fact]
    public async Task LowStockIsAnnouncedWhenAnItemCrossesIntoLow_AndNotWhileItStaysLow()
    {
        var events = await SubscribeToLowStockAsync();
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 7)));
        Assert.Empty(events);

        await Adjust(vendor, created.Id, -1); // 6, still above 5
        Assert.Empty(events);
        await Adjust(vendor, created.Id, -1); // 5, crosses into low
        var low = Assert.Single(events);
        Assert.Equal((created.Id, _vendor), (low.Payload.ListingId, low.Payload.VendorId));
        Assert.Equal("LowStockDetected", low.EventType);

        await Adjust(vendor, created.Id, -1); // 4, still low: no repeat
        await Adjust(vendor, created.Id, -4); // 0, sold out: still the same low state
        Assert.Single(events);

        await Adjust(vendor, created.Id, 10); // 10, back above
        await Adjust(vendor, created.Id, -6); // 4, crosses again
        Assert.Equal(2, events.Count);
    }

    [Fact]
    public async Task AnEditThatSetsALowQuantityAnnouncesIt_ButCreatingAnAlreadyLowItemDoesNot()
    {
        var events = await SubscribeToLowStockAsync();
        var vendor = await VerifiedVendorAsync();

        var created = await CreateAsync(vendor, Body(Stock(quantity: 2)));
        Assert.Empty(events); // created already low: no transition happened

        await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(Stock(quantity: 40)));
        await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(Stock(quantity: 3)));

        Assert.Single(events);
    }

    [Fact]
    public async Task LoweringTheThresholdPastTheQuantityAnnouncesLow()
    {
        var events = await SubscribeToLowStockAsync();
        var vendor = await VerifiedVendorAsync();
        var created = await CreateAsync(vendor, Body(Stock(quantity: 8, threshold: 3)));

        await vendor.PutAsJsonAsync($"/catalog/listings/{created.Id}", Body(Stock(quantity: 8, threshold: 10)));

        Assert.Single(events);
    }

    // ---- seed ----------------------------------------------------------------------------------

    [Fact]
    public void TheSeedShowsEveryStockStatusAndMadeToOrder()
    {
        var seeded = SeedData.Listings().ToDictionary(l => l.Id, StockPolicy.StatusOf);

        Assert.Equal(StockStatuses.InStock, seeded["listing-sourdough-001"]);
        Assert.Equal(StockStatuses.Low, seeded["listing-croissant-001"]);
        Assert.Equal(StockStatuses.SoldOut, seeded["listing-muffin-001"]);
        Assert.Null(SeedData.Listings().Single(l => l.Id == "listing-latte-001").AvailableQuantity); // made to order
        Assert.Equal(4, SeedData.Listings().Single(l => l.Id == "listing-sourdough-001").MaxPerOrder);
    }
}

internal static class AsyncEnumerableExtensions
{
    public static async Task<List<T>> ToListAsync<T>(this IAsyncEnumerable<T> source)
    {
        var list = new List<T>();
        await foreach (var item in source) list.Add(item);
        return list;
    }
}
