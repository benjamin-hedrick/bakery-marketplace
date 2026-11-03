namespace BakeryMarketplace.Caching;

/// <summary>
/// Adapter interface for all cache backends (local in-process, Redis, etc.).
/// Implementations must never throw on a cache miss — return CacheResult&lt;T&gt;.Miss() instead.
/// See ADR-0002 for the environment-conditional caching strategy.
/// </summary>
public interface ICacheProvider
{
    Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default);

    /// <summary>
    /// Reads several keys in one round trip. The result holds the keys that were found; a missing key (or one whose
    /// stored value cannot be read as <typeparamref name="T"/>) is simply absent, never an error. Duplicate keys are read once.
    /// </summary>
    Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default);
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
}
