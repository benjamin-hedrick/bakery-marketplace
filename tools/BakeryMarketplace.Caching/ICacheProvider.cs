namespace BakeryMarketplace.Caching;

/// <summary>
/// Adapter interface for all cache backends (local in-process, Redis, etc.).
/// Implementations must never throw on a cache miss — return CacheResult&lt;T&gt;.Miss() instead.
/// See ADR-0002 for the environment-conditional caching strategy.
/// </summary>
public interface ICacheProvider
{
    Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default);
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
}
