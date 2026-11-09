using BakeryMarketplace.Caching;
using CatalogService.Services;
using CatalogService.Tags;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CatalogService.Tests;

/// <summary>
/// The dependencies of <see cref="ListingService"/> and <see cref="StockReservationService"/> that a test does not care about. They are
/// required by the services (a host must not run without them), so a test that is not about the cache or the tags passes these.
/// </summary>
internal static class TestServices
{
    public static ITagRegistry Tags => TagRegistry.LoadEmbedded();

    public static TagOptions TagLimits => new();

    /// <summary>A cache with a zero TTL: every read goes to the store and nothing is kept, the same as the service with <c>ListingCache:TtlSeconds=0</c>.</summary>
    public static ListingCache CacheOff() => new(
        new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())),
        Options.Create(new ListingCacheOptions { TtlSeconds = 0 }),
        NullLogger<ListingCache>.Instance);
}
