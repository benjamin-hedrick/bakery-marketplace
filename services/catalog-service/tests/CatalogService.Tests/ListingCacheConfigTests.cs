using System.Net.Http.Json;
using System.Text.Json;

namespace CatalogService.Tests;

/// <summary>
/// WI-CAT-003: the cache is wired into the real service (<c>Cache:Backend</c>, the invalidation reaching the cache through the real event path), and
/// it is chosen explicitly: an unknown backend stops the start. With the cache Redis unreachable the service still starts and still answers from
/// the local fallback.
/// </summary>
public sealed class ListingCacheConfigTests
{
    private const string UnreachableRedis = "127.0.0.1:1,connectTimeout=300,syncTimeout=300,asyncTimeout=300";

    [Fact]
    public void AnUnknownCacheBackendStopsTheStartAndNamesTheSetting()
    {
        using var factory = new CatalogFactory { HostSettings = { ["Cache:Backend"] = "memcached" } };

        var failure = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Cache:Backend", failure.ToString());
    }

    [Theory]
    [InlineData("local")]
    [InlineData("redis")] // the cache Redis is not there: the resilient provider falls back to the local one
    public async Task ASuspensionAndAReverificationReachTheCacheThroughTheRealEventPath(string backend)
    {
        using var factory = new CatalogFactory
        {
            HostSettings = { ["Cache:Backend"] = backend, ["Cache:Redis:ConnectionString"] = UnreachableRedis },
        };
        var vendor = $"vendor-{Guid.NewGuid():N}";
        await factory.VerifyVendorAsync(vendor, sequence: 1);
        var owner = factory.ClientFor(vendor, "Vendor");
        var anon = factory.CreateClient();
        var created = await owner.PostAsJsonAsync("/catalog/listings", new { name = "Country Sourdough", category = "Bread", priceCents = 800, status = "Published" });
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
        var id = JsonDocument.Parse(await created.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetString()!;

        Assert.True(await IsListedAsync(anon, id)); // cold, then warm
        Assert.True(await IsListedAsync(anon, id));

        await factory.SuspendVendorAsync(vendor, sequence: 2);
        Assert.False(await IsListedAsync(anon, id)); // at once, not after the 60 seconds
        Assert.Equal(System.Net.HttpStatusCode.NotFound, (await anon.GetAsync($"/catalog/listings/{id}")).StatusCode);

        await factory.VerifyVendorAsync(vendor, sequence: 3);
        Assert.True(await IsListedAsync(anon, id));
        Assert.Equal(System.Net.HttpStatusCode.OK, (await anon.GetAsync($"/catalog/listings/{id}")).StatusCode);
    }

    private static async Task<bool> IsListedAsync(HttpClient client, string id)
    {
        var response = await client.GetAsync("/catalog/listings?limit=100");
        Assert.True(response.IsSuccessStatusCode);
        var items = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("items");
        return items.EnumerateArray().Any(i => i.GetProperty("id").GetString() == id);
    }
}
