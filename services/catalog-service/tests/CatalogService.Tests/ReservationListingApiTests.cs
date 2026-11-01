using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using CatalogService.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>Register item 62: the read the ordering service's orphan sweep uses to find Active reservations in an age window.</summary>
public sealed class ReservationListingApiTests : IDisposable
{
    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _ordering;
    private IRepository<StockReservationDocument> Reservations => _factory.Services.GetRequiredService<IRepository<StockReservationDocument>>();

    public ReservationListingApiTests()
    {
        _ordering = _factory.ServiceClientFor("ordering-service", ServiceRoles.StockReserve);
    }

    public void Dispose() => _factory.Dispose();

    private async Task SeedAsync(string orderId, string vendorId, TimeSpan age, string state = ReservationStates.Active)
    {
        var made = DateTimeOffset.UtcNow - age;
        await Reservations.SaveAsync(new StockReservationDocument
        {
            Id = StockReservationDocument.IdFor(orderId),
            VendorId = vendorId,
            OrderId = orderId,
            State = state,
            CreatedAt = made,
            CreatedAtMs = made.ToUnixTimeMilliseconds(),
        }, vendorId);
    }

    private async Task<JsonElement> ListAsync(string query = "")
    {
        var response = await _ordering.GetAsync("/catalog/stock/reservations" + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static string[] OrderIds(JsonElement page) =>
        page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("orderId").GetString()!).ToArray();

    [Fact]
    public async Task OnlyActiveReservationsInsideTheAgeWindowAreListed()
    {
        await SeedAsync("order-too-new", "v1", TimeSpan.FromMinutes(5));
        await SeedAsync("order-orphan-a", "v1", TimeSpan.FromMinutes(30));
        await SeedAsync("order-orphan-b", "v2", TimeSpan.FromHours(3));
        await SeedAsync("order-released", "v1", TimeSpan.FromMinutes(30), ReservationStates.Released);
        await SeedAsync("order-too-old", "v1", TimeSpan.FromHours(30));

        var page = await ListAsync();

        Assert.Equal(["order-orphan-a", "order-orphan-b"], OrderIds(page));
        Assert.Equal("v2", page.GetProperty("items")[1].GetProperty("vendorId").GetString());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("nextCursor").ValueKind);
    }

    [Fact]
    public async Task TheWindowCanBeWidenedAndNarrowed()
    {
        await SeedAsync("order-1", "v1", TimeSpan.FromMinutes(30));
        await SeedAsync("order-2", "v1", TimeSpan.FromHours(30));

        Assert.Equal(["order-1"], OrderIds(await ListAsync("?olderThanMinutes=20")));
        Assert.Empty(OrderIds(await ListAsync("?olderThanMinutes=60")));
        Assert.Equal(["order-1", "order-2"], OrderIds(await ListAsync("?newerThanHours=48")));
    }

    [Fact]
    public async Task PagesFollowTheCursorInOrderIdOrderWithoutRepeatsOrGaps()
    {
        foreach (var id in new[] { "order-c", "order-a", "order-e", "order-b", "order-d" }) await SeedAsync(id, "v1", TimeSpan.FromMinutes(30));

        var first = await ListAsync("?limit=2");
        var second = await ListAsync($"?limit=2&after={first.GetProperty("nextCursor").GetString()}");
        var third = await ListAsync($"?limit=2&after={second.GetProperty("nextCursor").GetString()}");

        Assert.Equal(["order-a", "order-b"], OrderIds(first));
        Assert.Equal(["order-c", "order-d"], OrderIds(second));
        Assert.Equal(["order-e"], OrderIds(third));
        Assert.Equal(JsonValueKind.Null, third.GetProperty("nextCursor").ValueKind);
    }

    [Theory]
    [InlineData("?state=Released")]
    [InlineData("?olderThanMinutes=0")]
    [InlineData("?olderThanMinutes=1441")]
    [InlineData("?newerThanHours=0")]
    [InlineData("?newerThanHours=169")]
    [InlineData("?limit=0")]
    [InlineData("?limit=101")]
    [InlineData("?olderThanMinutes=120&newerThanHours=1")]
    public async Task AnInvalidQueryIsRefusedWithTheStandardBody(string query)
    {
        var response = await _ordering.GetAsync("/catalog/stock/reservations" + query);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("validation_failed", JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task OnlyAnAppOnlyTokenWithTheRoleMayList()
    {
        var callers = new Dictionary<string, (HttpClient Client, HttpStatusCode Expected)>
        {
            ["anonymous"] = (_factory.CreateClient(), HttpStatusCode.Unauthorized),
            ["a vendor"] = (_factory.ClientFor("vendor-1", "Vendor"), HttpStatusCode.Forbidden),
            ["a customer"] = (_factory.ClientFor("customer-1", "Customer"), HttpStatusCode.Forbidden),
            ["an admin"] = (_factory.ClientFor("admin-1", "Admin"), HttpStatusCode.Forbidden),
            ["a service without the role"] = (_factory.ServiceClientFor("other-service"), HttpStatusCode.Forbidden),
        };
        foreach (var (who, (client, expected)) in callers)
        {
            Assert.True(expected == (await client.GetAsync("/catalog/stock/reservations")).StatusCode, $"list as {who}");
        }

        var notAppOnly = _factory.CreateClient();
        notAppOnly.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _factory.ServiceToken("ordering-service", [ServiceRoles.StockReserve], appOnly: false));
        Assert.Equal(HttpStatusCode.Forbidden, (await notAppOnly.GetAsync("/catalog/stock/reservations")).StatusCode);
    }

    [Fact]
    public async Task AReservationMadeThroughTheServiceRecordsItsCreationTimeForTheWindow()
    {
        var vendor = $"vendor-{Guid.NewGuid():N}";
        await _factory.VerifyVendorAsync(vendor);
        var created = await _factory.ClientFor(vendor, "Vendor").PostAsJsonAsync("/catalog/listings", new
        {
            name = "Loaf",
            category = "Bread",
            priceCents = 800,
            status = "Published",
            stock = new { availableQuantity = 5 },
        });
        var listingId = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString();

        await _ordering.PostAsJsonAsync("/catalog/stock/reservations", new
        {
            orderId = "order-real",
            vendorId = vendor,
            lines = new[] { new { listingId, quantity = 1 } },
        });

        var stored = (await Reservations.GetAsync(StockReservationDocument.IdFor("order-real"), vendor))!;
        Assert.Equal(stored.CreatedAt.ToUnixTimeMilliseconds(), stored.CreatedAtMs);
        Assert.Empty(OrderIds(await ListAsync())); // made just now: far too new to be an orphan
    }
}
