using System.Text.Json;
using StackExchange.Redis;

namespace BakeryMarketplace.Caching;

/// <summary>
/// Managed Redis implementation of <see cref="ICacheProvider"/> using StackExchange.Redis.
/// See ADR-0002, ADR-0010, and WI-CACHE-002.
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

        try
        {
            RedisValue value = await _database.StringGetAsync(key);
            if (!value.HasValue || value.IsNull)
            {
                return CacheResult<T>.Miss();
            }

            T? deserialized = JsonSerializer.Deserialize<T>((string)value!, _jsonOptions);
            return deserialized is not null
                ? CacheResult<T>.Hit(deserialized)
                : CacheResult<T>.Miss();
        }
        catch
        {
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
