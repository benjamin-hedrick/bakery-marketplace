using System.Collections.Concurrent;
using BakeryMarketplace.Caching;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The <c>cache</c> layer (ADR-0002, ADR-0024, WI-CACHE-004): a decorator around the <b>primary</b> cache store that injects errors
/// (<c>failureRate</c>), latency (<c>latencyMs</c>) and an outage window (<c>outageFromSeconds</c>, <c>outageWindowSeconds</c>). It belongs under
/// <see cref="ResilientCacheProvider"/>, as <c>Resilient(Chaos(Redis))</c>, so the fallback is what gets exercised; wrapped around the resilient
/// provider it would hide the fallback. Decisions are keyed by the operation, the cache key and the attempt number of that operation and key, so a
/// scenario is repeatable. Every injected fault is in the runtime's journal.
/// </summary>
public sealed class ChaosCacheProvider : ICacheProvider
{
    public const string LayerName = "cache";

    private readonly ICacheProvider _inner;
    private readonly ChaosLayer _layer;
    private readonly ConcurrentDictionary<string, int> _attempts = new();

    public ChaosCacheProvider(ICacheProvider inner, ChaosRuntime runtime)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(LayerName);
    }

    private async Task InjectAsync(string operation, string key, CancellationToken ct)
    {
        if (_layer.Latency is { } delay)
        {
            _layer.Record("latency", $"{operation}:{key}");
            await Task.Delay(delay, ct);
        }

        if (_layer.InOutage)
        {
            _layer.Record("outage", $"{operation}:{key}");
            throw new InvalidOperationException("ChaosCacheProvider: simulated outage window is active.");
        }

        if (_layer.Setting("failureRate") > 0)
        {
            var attempt = _attempts.AddOrUpdate($"{operation}:{key}", 1, (_, n) => n + 1);
            if (_layer.Inject("failure", "failureRate", $"{operation}:{key}:{attempt}"))
                throw new InvalidOperationException("ChaosCacheProvider: simulated failure.");
        }
    }

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        await InjectAsync("get", key, ct);
        return await _inner.GetAsync<T>(key, ct);
    }

    public async Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default)
    {
        await InjectAsync("getMany", string.Join(',', keys.Order(StringComparer.Ordinal)), ct);
        return await _inner.GetManyAsync<T>(keys, ct);
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        await InjectAsync("set", key, ct);
        await _inner.SetAsync(key, value, ttl, ct);
    }

    public async Task<bool> SetIfAbsentAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        await InjectAsync("setIfAbsent", key, ct);
        return await _inner.SetIfAbsentAsync(key, value, ttl, ct);
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        await InjectAsync("delete", key, ct);
        await _inner.DeleteAsync(key, ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        await InjectAsync("exists", key, ct);
        return await _inner.ExistsAsync(key, ct);
    }
}
