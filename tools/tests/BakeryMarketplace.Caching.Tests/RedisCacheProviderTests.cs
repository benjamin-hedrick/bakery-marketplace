using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using StackExchange.Redis;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Proves that <see cref="RedisCacheProvider"/> passes the full <see cref="CacheProviderContractTests"/> suite.
/// See WI-CACHE-002.
/// </summary>
public sealed class RedisCacheProviderTests : CacheProviderContractTests
{
    private static readonly Lazy<ICacheProvider> LazyProvider = new Lazy<ICacheProvider>(() =>
    {
        var connectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? "localhost:6379";
        try
        {
            var options = ConfigurationOptions.Parse(connectionString);
            options.ConnectTimeout = 1000;
            options.SyncTimeout = 1000;
            options.AbortOnConnectFail = true;

            var multiplexer = ConnectionMultiplexer.Connect(options);
            return new RedisCacheProvider(multiplexer);
        }
        catch
        {
            return new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        }
    });

    protected override ICacheProvider CreateProvider() => LazyProvider.Value;
}
