using System.Text.Json;
using StackExchange.Redis;

namespace BakeryMarketplace.Caching;

/// <summary>
/// Managed Redis implementation of <see cref="ICacheProvider"/> using StackExchange.Redis.
/// See ADR-0002, ADR-0010, and WI-CACHE-002.
///
/// IMPORTANT: this class must let connectivity/timeout exceptions propagate from every
/// method (Get/Set/Delete/Exists) rather than swallowing them. ResilientCacheProvider
/// (WI-CACHE-003) depends on the primary provider throwing on failure so its circuit
/// breaker can detect the outage and route to LocalCacheProvider. Silently returning a
/// "miss" on a connection failure would defeat that fallback — see fix note under
/// GetAsync below (2026-09-16 review of Delegation Packet 02).
/// </summary>
public class RedisCacheProvider : ICacheProvider
{
    private readonly IDatabase _database;
    private readonly JsonSerializerOptions _jsonOptions;

    public RedisCacheProvider(IConnectionMultiplexer multiplexer, int db = -1)
    {
        if (multiplexer is null) throw new ArgumentNullException(nameof(multiplexer));
        _database = multiplexer.GetDatabase(db);
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    public RedisCacheProvider(IDatabase database)
    {
        _database = database ?? throw new ArgumentNullException(nameof(database));
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("Key cannot be null or empty.", nameof(key));

        // NOTE: Redis I/O (StringGetAsync) is intentionally NOT wrapped in a try/catch.
        // A connection failure, timeout, or other RedisException must propagate to the
        // caller (ResilientCacheProvider) so its circuit breaker trips and falls back
        // to LocalCacheProvider, exactly as it already does for SetAsync/DeleteAsync/
        // ExistsAsync below. The previous version of this method caught all exceptions
        // here and returned CacheResult<T>.Miss(), which made a real Redis outage
        // indistinguishable from a normal cache miss: the breaker never tripped, no
        // fallback warning was ever logged, and reads silently stopped being served
        // from cache at all instead of failing over. Only genuine "this value isn't a
        // cache miss, it's just not deserializable" cases are handled locally, below.
        RedisValue value = await _database.StringGetAsync(key);
        if (!value.HasValue || value.IsNull)
        {
            return CacheResult<T>.Miss();
        }

        try
        {
            T? deserialized = JsonSerializer.Deserialize<T>((string)value!, _jsonOptions);
            return deserialized is not null
                ? CacheResult<T>.Hit(deserialized)
                : CacheResult<T>.Miss();
        }
        catch (JsonException)
        {
            // The value came back from Redis successfully but isn't valid JSON for T
            // (e.g. a stale/incompatible shape written by an older version). This is a
            // data problem, not a connectivity problem, so it's correct to treat it as
            // a miss rather than trip the circuit breaker over it.
            return CacheResult<T>.Miss();
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("Key cannot be null or empty.", nameof(key));
        if (value is null) throw new ArgumentNullException(nameof(value));

        string serialized = JsonSerializer.Serialize(value, _jsonOptions);
        await _database.StringSetAsync(key, serialized, expiry: ttl);
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("Key cannot be null or empty.", nameof(key));

        await _database.KeyDeleteAsync(key);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(key)) throw new ArgumentException("Key cannot be null or empty.", nameof(key));

        return await _database.KeyExistsAsync(key);
    }
}
