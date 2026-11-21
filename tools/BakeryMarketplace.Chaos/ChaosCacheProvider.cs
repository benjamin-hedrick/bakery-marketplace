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

    // Aiming (WI-CHAOS-006): a rule's key for this layer is the cache key. A call the layer does not disturb goes straight through.
    // Returns whether the layer disturbs this call, after injecting what the scenario sets for it.
    private async Task<bool> InjectAsync(string operation, string key, CancellationToken ct)
    {
        if (!_layer.Disturbs(operation, key)) return false;
        if (_layer.Latency is { } delay)
        {
            // The timer before the journal entry, so a test that sees the entry cannot advance its manual clock before the timer exists (register 207).
            var wait = Task.Delay(delay, _layer.Time, ct);
            _layer.Record("latency", $"{operation}:{key}");
            await wait;
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

        return true;
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
        if (!await InjectAsync("delete", key, ct))
        {
            await _inner.DeleteAsync(key, ct);
            return;
        }

        // A delete that fails and leaves the entry in place: what an invalidation that does not get through looks like, so a reader sees the old value until the
        // entry expires. Separate from failureRate, which hits reads and writes alike and so rarely produces exactly this.
        if (_layer.Setting("deleteFailureRate") > 0)
        {
            var attempt = _attempts.AddOrUpdate($"deleteOnly:{key}", 1, (_, n) => n + 1);
            if (_layer.Inject("deleteFailure", "deleteFailureRate", $"delete:{key}:{attempt}"))
                throw new InvalidOperationException("ChaosCacheProvider: simulated delete failure (the entry stays).");
        }
        await _inner.DeleteAsync(key, ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        await InjectAsync("exists", key, ct);
        return await _inner.ExistsAsync(key, ct);
    }
}
