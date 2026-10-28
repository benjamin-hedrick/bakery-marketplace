using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Auth;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Api;
using CatalogService.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>WI-CAT-006 / ADR-0017: atomic stock reserve and release for the ordering service.</summary>
public sealed class StockReservationTests : IDisposable
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _anon;
    private readonly HttpClient _ordering;
    private readonly HttpClient _vendorClient;
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";

    public StockReservationTests()
    {
        _anon = _factory.CreateClient();
        _ordering = _factory.ServiceClientFor("ordering-service", ServiceRoles.StockReserve);
        _factory.VerifyVendorAsync(_vendor).GetAwaiter().GetResult();
        _vendorClient = _factory.ClientFor(_vendor, "Vendor");
    }

    public void Dispose() => _factory.Dispose();

    private async Task<ListingDto> ListingAsync(int? quantity, int? maxPerOrder = null, int? threshold = null, string status = "Published")
    {
        var response = await _vendorClient.PostAsJsonAsync("/catalog/listings", new
        {
            name = "Country Sourdough",
            category = "Bread",
            priceCents = 800,
            status,
            stock = new { availableQuantity = quantity, maxPerOrder, lowStockThreshold = threshold },
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ListingDto>())!;
    }

    private async Task<int?> QuantityAsync(string listingId) => (await _factory.Listings.GetAsync(listingId, _vendor))!.AvailableQuantity;

    private static object Reserve(string orderId, string vendorId, params (string ListingId, int Quantity)[] lines) => new
    {
        orderId,
        vendorId,
        lines = lines.Select(l => new { listingId = l.ListingId, quantity = l.Quantity }).ToArray(),
    };

    private Task<HttpResponseMessage> Post(object body, HttpClient? client = null) =>
        (client ?? _ordering).PostAsJsonAsync("/catalog/stock/reservations", body);

    private Task<HttpResponseMessage> Release(string orderId, string? vendorId = null, HttpClient? client = null) =>
        (client ?? _ordering).DeleteAsync($"/catalog/stock/reservations/{orderId}?vendorId={vendorId ?? _vendor}");

    private static async Task<JsonElement> JsonOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    // ---- reserve ------------------------------------------------------------------------------

    [Fact]
    public async Task ReservingTakesTheStockAndRecordsTheLines()
    {
        var a = await ListingAsync(10);
        var b = await ListingAsync(4);

        var response = await Post(Reserve("order-1", _vendor, (a.Id, 3), (b.Id, 4)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("Active", body.GetProperty("state").GetString());
        Assert.Equal(2, body.GetProperty("lines").GetArrayLength());
        Assert.All(body.GetProperty("lines").EnumerateArray(), l => Assert.True(l.GetProperty("limitedStock").GetBoolean()));
        Assert.Equal(7, await QuantityAsync(a.Id));
        Assert.Equal(0, await QuantityAsync(b.Id));
    }

    [Fact]
    public async Task MadeToOrderLinesAreAcceptedAndLeaveTheListingAlone()
    {
        var limited = await ListingAsync(5);
        var madeToOrder = await ListingAsync(null);

        var response = await Post(Reserve("order-2", _vendor, (limited.Id, 2), (madeToOrder.Id, 50)));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var lines = (await JsonOf(response)).GetProperty("lines").EnumerateArray().ToDictionary(
            l => l.GetProperty("listingId").GetString()!, l => l.GetProperty("limitedStock").GetBoolean());
        Assert.True(lines[limited.Id]);
        Assert.False(lines[madeToOrder.Id]);
        Assert.Equal(3, await QuantityAsync(limited.Id));
        Assert.Null(await QuantityAsync(madeToOrder.Id));
    }

    [Fact]
    public async Task OneLineWithoutStockRejectsTheWholeRequest_AndNothingChanges()
    {
        var plenty = await ListingAsync(5);
        var scarce = await ListingAsync(1);

        var response = await Post(Reserve("order-3", _vendor, (plenty.Id, 2), (scarce.Id, 3)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("reservation_rejected", body.GetProperty("code").GetString());
        var rejection = Assert.Single(body.GetProperty("lines").EnumerateArray());
        Assert.Equal((scarce.Id, "insufficient_stock", 1),
            (rejection.GetProperty("listingId").GetString(), rejection.GetProperty("reason").GetString(), rejection.GetProperty("available").GetInt32()));
        Assert.Equal(5, await QuantityAsync(plenty.Id)); // the satisfiable line was not taken
        Assert.Null(await _factory.Services.GetRequiredService<BakeryMarketplace.Data.IRepository<StockReservationDocument>>()
            .GetAsync(StockReservationDocument.IdFor("order-3"), _vendor)); // and no record was written
    }

    [Fact]
    public async Task EveryProblemLineIsReported()
    {
        var capped = await ListingAsync(10, maxPerOrder: 2);
        var draft = await ListingAsync(10, status: "Draft");

        var response = await Post(Reserve("order-4", _vendor, (capped.Id, 3), (draft.Id, 1), ("listing-nope", 1)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var reasons = (await JsonOf(response)).GetProperty("lines").EnumerateArray()
            .ToDictionary(l => l.GetProperty("listingId").GetString()!, l => l.GetProperty("reason").GetString());
        Assert.Equal("exceeds_max_per_order", reasons[capped.Id]);
        Assert.Equal("not_available", reasons[draft.Id]);
        Assert.Equal("listing_not_found", reasons["listing-nope"]);
    }

    [Fact]
    public async Task SeveralLinesForOneListingAreSummed()
    {
        var item = await ListingAsync(10, maxPerOrder: 5);

        var ok = await Post(Reserve("order-5", _vendor, (item.Id, 2), (item.Id, 3)));
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        Assert.Equal(5, await QuantityAsync(item.Id));
        Assert.Single((await JsonOf(ok)).GetProperty("lines").EnumerateArray());

        var tooMany = await Post(Reserve("order-5b", _vendor, (item.Id, 3), (item.Id, 3))); // sums to 6 > max 5
        Assert.Equal(HttpStatusCode.Conflict, tooMany.StatusCode);
        Assert.Equal(5, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task RepeatingTheSameReserveIsIdempotent()
    {
        var item = await ListingAsync(10);

        var first = await Post(Reserve("order-6", _vendor, (item.Id, 4)));
        var second = await Post(Reserve("order-6", _vendor, (item.Id, 4)));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(6, await QuantityAsync(item.Id)); // taken once
    }

    [Fact]
    public async Task TheSameOrderWithDifferentLinesIsRefused()
    {
        var item = await ListingAsync(10);
        await Post(Reserve("order-7", _vendor, (item.Id, 4)));

        var response = await Post(Reserve("order-7", _vendor, (item.Id, 5)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("reservation_exists", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Equal(6, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task AnUnverifiedVendorsStockCannotBeReserved()
    {
        var item = await ListingAsync(5);
        var unverified = $"vendor-{Guid.NewGuid():N}";

        var response = await Post(Reserve("order-8", unverified, (item.Id, 1)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(5, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task AListingOfAnotherVendorCannotBeReservedThroughThisVendorsId()
    {
        var mine = await ListingAsync(5);
        var other = $"vendor-{Guid.NewGuid():N}";
        await _factory.VerifyVendorAsync(other);

        var response = await Post(Reserve("order-9", other, (mine.Id, 1)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("listing_not_found", (await JsonOf(response)).GetProperty("lines")[0].GetProperty("reason").GetString());
        Assert.Equal(5, await QuantityAsync(mine.Id));
    }

    // ---- release ------------------------------------------------------------------------------

    [Fact]
    public async Task ReleasingReturnsTheStock_AndRepeatingItReturnsNothingMore()
    {
        var item = await ListingAsync(10);
        await Post(Reserve("order-10", _vendor, (item.Id, 4)));
        Assert.Equal(6, await QuantityAsync(item.Id));

        var first = await Release("order-10");
        var second = await Release("order-10");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal("Released", (await JsonOf(first)).GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(10, await QuantityAsync(item.Id)); // restored once
    }

    [Fact]
    public async Task ReleasingReturnsOnlyLimitedStock_NotMadeToOrderLines()
    {
        var limited = await ListingAsync(5);
        var madeToOrder = await ListingAsync(null);
        await Post(Reserve("order-11", _vendor, (limited.Id, 2), (madeToOrder.Id, 9)));

        await Release("order-11");

        Assert.Equal(5, await QuantityAsync(limited.Id));
        Assert.Null(await QuantityAsync(madeToOrder.Id));
    }

    [Fact]
    public async Task ReleasingIntoAListingThatBecameMadeToOrderAddsNoQuantity()
    {
        var item = await ListingAsync(5);
        await Post(Reserve("order-12", _vendor, (item.Id, 2)));
        await _vendorClient.PutAsJsonAsync($"/catalog/listings/{item.Id}", new
        {
            name = "Country Sourdough", category = "Bread", priceCents = 800, status = "Published",
            stock = new { availableQuantity = (int?)null },
        });

        var response = await Release("order-12");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task AReleasedReservationCannotBeReservedAgain()
    {
        var item = await ListingAsync(5);
        await Post(Reserve("order-13", _vendor, (item.Id, 2)));
        await Release("order-13");

        var response = await Post(Reserve("order-13", _vendor, (item.Id, 2)));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("reservation_released", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Equal(5, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task ReleasingUnknownOrdersIsNotFound_AndNeedsAVendorId()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await Release("never-reserved")).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await _ordering.DeleteAsync("/catalog/stock/reservations/order-x")).StatusCode);
    }

    [Fact]
    public async Task ReleasingCannotPushTheQuantityPastTheMaximum()
    {
        var item = await ListingAsync(StockPolicy.MaxQuantity);
        await Post(Reserve("order-14", _vendor, (item.Id, 5)));
        await _vendorClient.PostAsJsonAsync($"/catalog/listings/{item.Id}/stock/adjust", new { delta = 5 }); // back at the maximum

        await Release("order-14");

        Assert.Equal(StockPolicy.MaxQuantity, await QuantityAsync(item.Id));
    }

    // ---- races --------------------------------------------------------------------------------

    [Fact]
    public async Task TheLastUnitsGoToExactlyThatManyOrders_NoOversell()
    {
        var item = await ListingAsync(3);

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(i => Post(Reserve($"race-{i}", _vendor, (item.Id, 1)))));

        Assert.Equal(3, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(7, results.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(0, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task ManyRequestsForTheSameOrderTakeTheStockOnce()
    {
        var item = await ListingAsync(10);

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => Post(Reserve("same-order", _vendor, (item.Id, 4)))));

        Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(9, results.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.Equal(6, await QuantityAsync(item.Id));
    }

    [Fact]
    public async Task ReservationsAndVendorAdjustmentsRacingLoseNothing()
    {
        var item = await ListingAsync(20);

        var reserves = Enumerable.Range(0, 10).Select(i => Post(Reserve($"mix-{i}", _vendor, (item.Id, 1))));
        var adjusts = Enumerable.Range(0, 10).Select(_ => _vendorClient.PostAsJsonAsync($"/catalog/listings/{item.Id}/stock/adjust", new { delta = 1 }));
        var responses = await Task.WhenAll(reserves.Concat(adjusts));

        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode, r.StatusCode.ToString()));
        Assert.Equal(20, await QuantityAsync(item.Id)); // -10 reserved, +10 added
    }

    [Fact]
    public async Task ReservingAndReleasingManyOrdersConcurrentlyLeavesTheStockExact()
    {
        var item = await ListingAsync(30);
        await Task.WhenAll(Enumerable.Range(0, 10).Select(i => Post(Reserve($"cycle-{i}", _vendor, (item.Id, 2)))));
        Assert.Equal(10, await QuantityAsync(item.Id));

        await Task.WhenAll(Enumerable.Range(0, 10).Select(i => Release($"cycle-{i}")));

        Assert.Equal(30, await QuantityAsync(item.Id));
    }

    // ---- events and the public view -------------------------------------------------------------

    [Fact]
    public async Task ReservingStockIntoLowAnnouncesItOnce()
    {
        var events = new List<DomainEventEnvelope<LowStockDetectedPayload>>();
        await _factory.Services.GetRequiredService<IEventSubscriber>().SubscribeAsync<LowStockDetectedPayload>(
            "LowStockDetected", (e, _) => { events.Add(e); return Task.CompletedTask; });
        var item = await ListingAsync(8);

        await Post(Reserve("low-1", _vendor, (item.Id, 2))); // 6, still above 5
        Assert.Empty(events);
        await Post(Reserve("low-2", _vendor, (item.Id, 2))); // 4, crosses into low
        await Post(Reserve("low-3", _vendor, (item.Id, 1))); // 3, still low

        var low = Assert.Single(events);
        Assert.Equal(item.Id, low.Payload.ListingId);
    }

    [Fact]
    public async Task ReservedOutStockShowsAsSoldOutPublicly()
    {
        var item = await ListingAsync(2);
        await Post(Reserve("gone", _vendor, (item.Id, 2)));

        var publicView = await _anon.GetFromJsonAsync<ListingDto>($"/catalog/listings/{item.Id}");

        Assert.Equal(StockStatuses.SoldOut, publicView!.Stock.Status);
    }

    // ---- who may call --------------------------------------------------------------------------

    [Fact]
    public async Task OnlyAnAppOnlyTokenWithTheRoleMayReserveOrRelease()
    {
        var item = await ListingAsync(5);
        var body = Reserve("auth-1", _vendor, (item.Id, 1));
        var callers = new Dictionary<string, (HttpClient Client, HttpStatusCode Expected)>
        {
            ["anonymous"] = (_anon, HttpStatusCode.Unauthorized),
            ["the vendor themself"] = (_vendorClient, HttpStatusCode.Forbidden),
            ["a customer"] = (_factory.ClientFor("customer-1", "Customer"), HttpStatusCode.Forbidden),
            ["an admin"] = (_factory.ClientFor("admin-1", "Admin"), HttpStatusCode.Forbidden),
            ["a service without the role"] = (_factory.ServiceClientFor("other-service"), HttpStatusCode.Forbidden),
        };
        foreach (var (who, (client, expected)) in callers)
        {
            Assert.True(expected == (await Post(body, client)).StatusCode, $"reserve as {who}");
            Assert.True(expected == (await Release("auth-1", client: client)).StatusCode, $"release as {who}");
        }

        // The role on a token that is not app-only (a user token carrying it) is refused too.
        var notAppOnly = _factory.CreateClient();
        notAppOnly.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.ServiceToken("ordering-service", [ServiceRoles.StockReserve], appOnly: false));
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(body, notAppOnly)).StatusCode);

        Assert.Equal(5, await QuantityAsync(item.Id)); // none of it reserved anything
        Assert.Equal(HttpStatusCode.Created, (await Post(body)).StatusCode);
    }

    // ---- validation ---------------------------------------------------------------------------

    public static IEnumerable<object[]> InvalidRequests() =>
    [
        ["orderId", new { orderId = "", vendorId = "v", lines = new[] { new { listingId = "l", quantity = 1 } } }],
        ["orderId", new { orderId = "has space", vendorId = "v", lines = new[] { new { listingId = "l", quantity = 1 } } }],
        ["vendorId", new { orderId = "o", vendorId = " ", lines = new[] { new { listingId = "l", quantity = 1 } } }],
        ["lines", new { orderId = "o", vendorId = "v", lines = Array.Empty<object>() }],
        ["lines[0].quantity", new { orderId = "o", vendorId = "v", lines = new[] { new { listingId = "l", quantity = 0 } } }],
        ["lines[0].quantity", new { orderId = "o", vendorId = "v", lines = new[] { new { listingId = "l", quantity = StockPolicy.MaxQuantity + 1 } } }],
        ["lines[0].listingId", new { orderId = "o", vendorId = "v", lines = new[] { new { listingId = "", quantity = 1 } } }],
        ["lines", new { orderId = "o", vendorId = "v", lines = Enumerable.Range(0, ReservationValidator.MaxLines + 1).Select(i => new { listingId = $"l{i}", quantity = 1 }).ToArray() }],
    ];

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public async Task InvalidRequestsAreRejectedWithAFieldError(string field, object body)
    {
        var response = await Post(body);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty(field, out _), field);
    }
}
