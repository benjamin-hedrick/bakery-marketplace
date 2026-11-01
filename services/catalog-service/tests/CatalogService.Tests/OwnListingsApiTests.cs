using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Auth;
using CatalogService.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace CatalogService.Tests;

/// <summary>Register item 63: a vendor reads their own listings, drafts and exact stock included, and nobody else's.</summary>
public sealed class OwnListingsApiTests : IDisposable
{
    private readonly CatalogFactory _factory = new();
    private readonly string _vendor = $"vendor-{Guid.NewGuid():N}";
    private readonly string _other = $"vendor-{Guid.NewGuid():N}";
    private readonly HttpClient _mine;
    private readonly HttpClient _theirs;

    public OwnListingsApiTests()
    {
        _factory.VerifyVendorAsync(_vendor).GetAwaiter().GetResult();
        _factory.VerifyVendorAsync(_other).GetAwaiter().GetResult();
        _mine = _factory.ClientFor(_vendor, "Vendor");
        _theirs = _factory.ClientFor(_other, "Vendor");
    }

    public void Dispose() => _factory.Dispose();

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<string> CreateAsync(HttpClient client, string name, string status, int? quantity = null)
    {
        var response = await client.PostAsJsonAsync("/catalog/listings", new
        {
            name, category = "Bread", priceCents = 800, status,
            stock = quantity is null ? null : new { availableQuantity = quantity, lowStockThreshold = 2 },
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await JsonOf(response)).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task AVendorListsTheirOwnDraftsAndPublishedListingsWithExactStockAndNobodyElses()
    {
        var draft = await CreateAsync(_mine, "Draft loaf", "Draft", 7);
        var published = await CreateAsync(_mine, "Live loaf", "Published", 12);
        await CreateAsync(_theirs, "Someone else's loaf", "Published", 3);

        var page = await JsonOf(await _mine.GetAsync("/catalog/listings/mine"));

        var items = page.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(new[] { draft, published }.Order(), items.Select(i => i.GetProperty("id").GetString()!).Order());
        Assert.All(items, i => Assert.Equal(_vendor, i.GetProperty("vendorId").GetString()));
        var live = items.Single(i => i.GetProperty("id").GetString() == published);
        Assert.Equal(12, live.GetProperty("stock").GetProperty("availableQuantity").GetInt32());
        Assert.Equal(2, live.GetProperty("stock").GetProperty("lowStockThreshold").GetInt32());
        Assert.Equal("Draft", items.Single(i => i.GetProperty("id").GetString() == draft).GetProperty("status").GetString());
    }

    [Fact]
    public async Task TheListCanBeNarrowedByStatusAndPaged()
    {
        for (var i = 0; i < 3; i++) await CreateAsync(_mine, $"Published {i}", "Published");
        await CreateAsync(_mine, "A draft", "Draft");

        var onlyDrafts = await JsonOf(await _mine.GetAsync("/catalog/listings/mine?status=Draft"));
        var first = await JsonOf(await _mine.GetAsync("/catalog/listings/mine?limit=3"));
        var second = await JsonOf(await _mine.GetAsync($"/catalog/listings/mine?limit=3&after={first.GetProperty("nextCursor").GetString()}"));

        Assert.Single(onlyDrafts.GetProperty("items").EnumerateArray());
        Assert.Equal(3, first.GetProperty("items").GetArrayLength());
        Assert.Single(second.GetProperty("items").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("nextCursor").ValueKind);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await _mine.GetAsync("/catalog/listings/mine?status=Archived")).StatusCode);
    }

    [Fact]
    public async Task AVendorReadsOneOfTheirOwnListingsButAnotherVendorsLooksMissing()
    {
        var id = await CreateAsync(_mine, "Draft loaf", "Draft", 5);

        var own = await _mine.GetAsync($"/catalog/listings/mine/{id}");
        var foreign = await _theirs.GetAsync($"/catalog/listings/mine/{id}");

        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        Assert.Equal(5, (await JsonOf(own)).GetProperty("stock").GetProperty("availableQuantity").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _mine.GetAsync("/catalog/listings/mine/listing-nope")).StatusCode);
    }

    [Fact]
    public async Task AStockReservationRecordInTheVendorsPartitionIsNeverReturnedAsAListing()
    {
        var listing = await CreateAsync(_mine, "Loaf", "Published", 10);
        var service = _factory.ServiceClientFor("ordering-service", ServiceRoles.StockReserve);
        var reserved = await service.PostAsJsonAsync("/catalog/stock/reservations", new
        {
            orderId = "order-1", vendorId = _vendor, lines = new[] { new { listingId = listing, quantity = 1 } },
        });
        Assert.Equal(HttpStatusCode.Created, reserved.StatusCode);

        var page = await JsonOf(await _mine.GetAsync("/catalog/listings/mine"));
        var asListing = await _mine.GetAsync($"/catalog/listings/mine/{StockReservationDocument.IdFor("order-1")}");

        Assert.Equal([listing], page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!));
        Assert.Equal(HttpStatusCode.NotFound, asListing.StatusCode);
    }

    [Fact]
    public async Task OnlyAVendorMayReadThem()
    {
        var callers = new Dictionary<string, (HttpClient Client, HttpStatusCode Expected)>
        {
            ["anonymous"] = (_factory.CreateClient(), HttpStatusCode.Unauthorized),
            ["a customer"] = (_factory.ClientFor("customer-1", "Customer"), HttpStatusCode.Forbidden),
            ["an admin"] = (_factory.ClientFor("admin-1", "Admin"), HttpStatusCode.Forbidden),
            ["a service"] = (_factory.ServiceClientFor("ordering-service", ServiceRoles.StockReserve), HttpStatusCode.Forbidden),
        };
        foreach (var (who, (client, expected)) in callers)
        {
            Assert.True(expected == (await client.GetAsync("/catalog/listings/mine")).StatusCode, $"list as {who}");
            Assert.True(expected == (await client.GetAsync("/catalog/listings/mine/x")).StatusCode, $"get as {who}");
        }
    }

    [Fact]
    public async Task ThePublicListIsUnchangedAndStillHidesDraftsAndExactStock()
    {
        await CreateAsync(_mine, "Draft loaf", "Draft", 7);
        var published = await CreateAsync(_mine, "Live loaf", "Published", 12);

        var page = await JsonOf(await _factory.CreateClient().GetAsync("/catalog/listings"));

        var mine = page.GetProperty("items").EnumerateArray().Where(i => i.GetProperty("vendorId").GetString() == _vendor).ToList();
        Assert.Equal(published, Assert.Single(mine).GetProperty("id").GetString());
        Assert.False(mine[0].GetProperty("stock").TryGetProperty("availableQuantity", out _));
    }
}
