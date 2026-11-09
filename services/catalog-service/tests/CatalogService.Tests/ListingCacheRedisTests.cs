using System.Text.Json;
using BakeryMarketplace.Caching;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using CatalogService.Tags;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace CatalogService.Tests;

/// <summary>
/// A <see cref="FactAttribute"/> that is reported as skipped, not passed, when Redis is not reachable at <c>REDIS_CONNECTION_STRING</c>
/// (default <c>localhost:6379</c>), so a run without Docker does not look like proof of the Redis path.
/// </summary>
internal sealed class RedisFactAttribute : FactAttribute
{
    public static readonly string ConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? "localhost:6379";

    private static readonly Lazy<bool> Reachable = new(() =>
    {
        try
        {
            var options = ConfigurationOptions.Parse(ConnectionString);
            options.ConnectTimeout = 1000;
            options.SyncTimeout = 1000;
            options.AbortOnConnectFail = true;
            using var connection = ConnectionMultiplexer.Connect(options);
            return connection.IsConnected;
        }
        catch
        {
            return false;
        }
    });

    public RedisFactAttribute()
    {
        if (!Reachable.Value) Skip = $"Redis is not reachable at {RedisFactAttribute.ConnectionString}";
    }
}

/// <summary>
/// WI-CAT-003 against a real Redis. The Redis provider serializes with System.Text.Json while the documents carry Newtonsoft attributes, so what comes
/// back from Redis must be the same listing, field for field and as a customer sees it. Needs Redis (<c>REDIS_CONNECTION_STRING</c>, for instance
/// <c>127.0.0.1:6379</c>); skipped, and reported as skipped, without it.
/// </summary>
public sealed class ListingCacheRedisTests
{
    [RedisFact]
    public async Task AListingReadBackFromRedisIsTheSameListingAndTheSameCustomerView()
    {
        var vendor = $"vendor-redis-{Guid.NewGuid():N}";
        await using var multiplexer = await ConnectionMultiplexer.ConnectAsync(RedisFactAttribute.ConnectionString);
        var provider = new RedisCacheProvider(multiplexer);
        ListingCache NewInstance() => new(provider, Options.Create(new ListingCacheOptions()), NullLogger<ListingCache>.Instance);

        var database = new FakeDatabase();
        var listings = new FakeRepository<ListingDocument>(d => d.Id, database);
        var status = new FakeRepository<VendorStatusDocument>(d => d.Id);
        await status.SaveAsync(new VendorStatusDocument { Id = vendor, Verified = true, LastSequence = 1 }, VendorStatusStore.Partition);
        var time = TimeProvider.System;
        var publisher = new ListingEventPublisher(
            new InMemoryEventTransport(), listings, Options.Create(new OutboxOptions()), time, NullLogger<ListingEventPublisher>.Instance);
        var service = new ListingService(listings, new VendorStatusStore(status, TestServices.CacheOff()), publisher, time, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, TestServices.CacheOff());
        var created = await service.CreateAsync(vendor, new ListingRequest(
            "Country Sourdough", "A loaf", "bread", 800,
            [new ModifierRequest("mod-seeds", "Seed crust", 100, ["sesame"], ["vegan"])],
            ["gluten"], "Published", new StockRequest(42, 6, 7), ["vegan"]));
        Assert.Equal(ListingOutcome.Created, created.Outcome);

        try
        {
            // Instance A loads from the store and writes to Redis. Instance B (another process, in effect) must read it from Redis only.
            var written = await NewInstance().PublishedListingsAsync(vendor, async t => await Load(listings, vendor, t));
            var fromRedis = await NewInstance().PublishedListingsAsync(vendor, _ => throw new InvalidOperationException("a hit must not load"));

            var before = Assert.Single(written);
            var after = Assert.Single(fromRedis);
            Assert.Equal(before.Id, after.Id);
            Assert.Equal(before.VendorId, after.VendorId);
            Assert.Equal(before.Name, after.Name);
            Assert.Equal(before.PriceCents, after.PriceCents);
            Assert.Equal(before.Status, after.Status);
            Assert.Equal(before.AvailableQuantity, after.AvailableQuantity);
            Assert.Equal(before.MaxPerOrder, after.MaxPerOrder);
            Assert.Equal(before.LowStockThreshold, after.LowStockThreshold);
            Assert.Equal(before.AllergenFlags, after.AllergenFlags);
            Assert.Equal(before.Modifiers.Select(m => (m.Id, m.Name, m.PriceDeltaCents)), after.Modifiers.Select(m => (m.Id, m.Name, m.PriceDeltaCents)));
            Assert.Equal(before.Modifiers.SelectMany(m => m.Allergens), after.Modifiers.SelectMany(m => m.Allergens));

            // And what a customer would be sent is identical.
            var tags = new TagProjector(TagRegistry.LoadEmbedded(), time);
            var web = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            Assert.Equal(JsonSerializer.Serialize(ListingDto.From(before, tags), web), JsonSerializer.Serialize(ListingDto.From(after, tags), web));

            // The verified vendor list round-trips too.
            var ids = await NewInstance().VerifiedVendorIdsAsync(_ => Task.FromResult<IReadOnlyList<string>>([vendor]));
            Assert.Equal([vendor], await NewInstance().VerifiedVendorIdsAsync(_ => throw new InvalidOperationException("a hit must not load")));
            Assert.Equal([vendor], ids);
        }
        finally
        {
            await provider.DeleteAsync(ListingCache.VendorKey(vendor));
            await provider.DeleteAsync(ListingCache.VerifiedVendorsKey);
        }
    }

    private static async Task<IReadOnlyList<ListingDocument>> Load(IRepository<ListingDocument> listings, string vendor, CancellationToken ct)
    {
        var all = new List<ListingDocument>();
        await foreach (var l in listings.QueryAsync(vendor, q => q.Where(x => x.Status == ListingStatuses.Published), ct)) all.Add(l);
        return all;
    }
}
