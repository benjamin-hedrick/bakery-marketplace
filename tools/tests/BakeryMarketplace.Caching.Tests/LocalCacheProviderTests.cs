using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Proves that <see cref="LocalCacheProvider"/> passes the full <see cref="CacheProviderContractTests"/> suite.
/// See WI-CACHE-003.
/// </summary>
public sealed class LocalCacheProviderTests : CacheProviderContractTests
{
    private readonly IMemoryCache _memoryCache = new MemoryCache(new MemoryCacheOptions());

    protected override ICacheProvider CreateProvider() =>
        new LocalCacheProvider(_memoryCache);

    public override void Dispose()
    {
        _memoryCache.Dispose();
        base.Dispose();
    }
}
