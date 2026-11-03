using Microsoft.Extensions.Caching.Memory;

namespace BakeryMarketplace.Caching;

/// <summary>
/// In-process, zero-external-dependency cache implementation using IMemoryCache.
/// Used as the local dev fallback and as the <see cref="ResilientCacheProvider"/>'s fallback backend.
/// See ADR-0002 for the environment-conditional caching strategy.
/// </summary>
public sealed class LocalCacheProvider : ICacheProvider
{
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromSeconds(60);

    public LocalCacheProvider(IMemoryCache cache)
    {
        _cache = cache ?? throw new ArgumentNullException(nameof(cache));
    }

    public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(key, out T? value))
            return Task.FromResult(CacheResult<T>.Hit(value!));

        return Task.FromResult(CacheResult<T>.Miss());
    }

    public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(keys);
        var found = new Dictionary<string, T>();
        foreach (var key in keys.Distinct())
            if (_cache.TryGetValue(key, out T? value) && value is not null)
                found[key] = value;
        return Task.FromResult<IReadOnlyDictionary<string, T>>(found);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        var options = new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = ttl ?? DefaultTtl
        };
        _cache.Set(key, value, options);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        _cache.Remove(key);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        return Task.FromResult(_cache.TryGetValue(key, out _));
    }
}
