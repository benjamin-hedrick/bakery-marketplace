using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Caching;

/// <summary>
/// Circuit-breaking decorator that wraps a configured primary <see cref="ICacheProvider"/>
/// and falls back to a <see cref="LocalCacheProvider"/> on primary failure.
///
/// Behavior per ADR-0002:
/// - Primary success → passthrough
/// - Primary failure/timeout → trip circuit breaker → route to fallback → emit ILogger warning
/// - Breaker probes primary periodically; closes on successful probe
///
/// Every fallback is counted (<c>cache_fallback</c>, meter <see cref="MeterName"/>, tagged with the operation and the reason). A failure of the primary
/// itself is also logged as a warning; a call the open breaker refuses is only counted, because the breaker logs its own opening and closing
/// (register 205: logging each refused call gave one warning with a stack trace per cache call for as long as the primary was down).
///
/// <para>
/// <b>Pending deletes (register 184).</b> A delete the primary did not take leaves the primary's old entry in place, and once the breaker closed that old
/// entry would be served again until its TTL: a reader could see old, new (from the fallback while the breaker was open), then old again. So a key whose
/// primary delete failed is marked pending in this instance. Every later call for that key first tries the delete again; while it still fails, the call
/// uses the fallback only, never the primary's old entry; once it succeeds the mark is cleared and the key goes to the primary as before, and the old entry
/// is gone for every instance that shares the primary. The marks are per instance: another instance that reads the key before this one's delete lands can
/// still see the old entry, within the TTL bound ADR-0002 accepts. A mark lasts until a delete of the key reaches the primary; the keys are the ones
/// invalidated while the primary was failing, so the set stays as small as the set of keys written in an outage.
/// </para>
///
/// This decorator is vendor-agnostic. It doesn't care what backs the primary provider.
/// </summary>
public sealed partial class ResilientCacheProvider : ICacheProvider, IDisposable
{
    /// <summary>The name of the fallback meter, for a service's telemetry registration.</summary>
    public const string MeterName = "BakeryMarketplace.Caching";

    private readonly ICacheProvider _primary;
    private readonly ICacheProvider _fallback;
    private readonly ICircuitBreakerPolicy _breaker;
    private readonly ILogger<ResilientCacheProvider> _logger;
    private readonly Meter _meter = new(MeterName);
    private readonly Counter<long> _fallbacks;

    // Key → the mark's number. A retry clears the mark only if it is still the one the retry started from, so a delete that failed while the retry was
    // under way keeps its own mark.
    private readonly ConcurrentDictionary<string, long> _pendingDeletes = new();
    private long _lastMark;

    /// <summary>This instance's meter (one per provider, so a test reads only its own).</summary>
    public Meter Meter => _meter;

    /// <summary>The keys whose delete has not reached the primary yet (register 184); read by tests and diagnostics.</summary>
    public IReadOnlyCollection<string> PendingDeletes => _pendingDeletes.Keys.ToList();

    public ResilientCacheProvider(
        ICacheProvider primary,
        ICacheProvider fallback,
        ICircuitBreakerPolicy breaker,
        ILogger<ResilientCacheProvider> logger)
    {
        _primary = primary ?? throw new ArgumentNullException(nameof(primary));
        _fallback = fallback ?? throw new ArgumentNullException(nameof(fallback));
        _breaker = breaker ?? throw new ArgumentNullException(nameof(breaker));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _fallbacks = _meter.CreateCounter<long>(
            "cache_fallback",
            description: "Cache calls served by the fallback, by operation and reason (primary_failure, breaker_open or pending_delete)");
    }

    public void Dispose() => _meter.Dispose();

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        if (!await PrimaryMayServeAsync(key, nameof(GetAsync), ct)) return await _fallback.GetAsync<T>(key, ct);
        try
        {
            return await _breaker.ExecuteAsync(
                token => _primary.GetAsync<T>(key, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(GetAsync), key, ex);
            return await _fallback.GetAsync<T>(key, ct);
        }
    }

    public async Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default)
    {
        // Keys still pending a delete are read from the fallback; the rest go to the primary in one call, as before.
        List<string>? pending = null;
        foreach (var key in keys.Distinct())
        {
            if (!await PrimaryMayServeAsync(key, nameof(GetManyAsync), ct)) (pending ??= []).Add(key);
        }
        if (pending is null) return await GetManyFromPrimaryAsync<T>(keys, ct);

        var fromPrimary = keys.Except(pending).ToList();
        var result = new Dictionary<string, T>(await _fallback.GetManyAsync<T>(pending, ct));
        if (fromPrimary.Count > 0)
        {
            foreach (var (key, value) in await GetManyFromPrimaryAsync<T>(fromPrimary, ct)) result[key] = value;
        }
        return result;
    }

    private async Task<IReadOnlyDictionary<string, T>> GetManyFromPrimaryAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct)
    {
        try
        {
            return await _breaker.ExecuteAsync(
                token => _primary.GetManyAsync<T>(keys, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(GetManyAsync), $"{keys.Count} keys", ex);
            return await _fallback.GetManyAsync<T>(keys, ct);
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        if (!await PrimaryMayServeAsync(key, nameof(SetAsync), ct))
        {
            await _fallback.SetAsync(key, value, ttl, ct);
            return;
        }
        try
        {
            await _breaker.ExecuteAsync(
                token => _primary.SetAsync(key, value, ttl, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(SetAsync), key, ex);
            await _fallback.SetAsync(key, value, ttl, ct);
        }
    }

    public async Task<bool> SetIfAbsentAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        if (!await PrimaryMayServeAsync(key, nameof(SetIfAbsentAsync), ct)) return await _fallback.SetIfAbsentAsync(key, value, ttl, ct);
        try
        {
            return await _breaker.ExecuteAsync(
                token => _primary.SetIfAbsentAsync(key, value, ttl, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(SetIfAbsentAsync), key, ex);
            return await _fallback.SetIfAbsentAsync(key, value, ttl, ct); // atomic in this process only; the claim holds for this instance
        }
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var mark = Interlocked.Increment(ref _lastMark);
        try
        {
            await _breaker.ExecuteAsync(
                token => _primary.DeleteAsync(key, token), ct);
            _pendingDeletes.TryRemove(key, out _); // this delete reached the primary: any earlier mark for the key is settled by it
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _pendingDeletes[key] = mark; // the primary may still hold the old entry: keep away from it until a delete lands (register 184)
            OnFallback(nameof(DeleteAsync), key, ex);
        }

        // Always the fallback too, not only when the primary failed: the fallback may hold a copy filled while the breaker was open, and a delete that reached
        // only the primary would leave that copy to be served (until its TTL) if the breaker opens again.
        await _fallback.DeleteAsync(key, ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        if (!await PrimaryMayServeAsync(key, nameof(ExistsAsync), ct)) return await _fallback.ExistsAsync(key, ct);
        try
        {
            return await _breaker.ExecuteAsync(
                token => _primary.ExistsAsync(key, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(ExistsAsync), key, ex);
            return await _fallback.ExistsAsync(key, ct);
        }
    }

    /// <summary>
    /// True when the primary may be used for <paramref name="key"/>: the key has no pending delete, or the retried delete has just reached the primary.
    /// False (and counted as a <c>pending_delete</c> fallback of <paramref name="operation"/>) while the delete still fails.
    /// </summary>
    private async Task<bool> PrimaryMayServeAsync(string key, string operation, CancellationToken ct)
    {
        if (!_pendingDeletes.TryGetValue(key, out var mark)) return true;
        try
        {
            await _breaker.ExecuteAsync(
                token => _primary.DeleteAsync(key, token), ct);
            _pendingDeletes.TryRemove(new KeyValuePair<string, long>(key, mark));
            if (!_pendingDeletes.ContainsKey(key)) return true; // still marked only if a delete failed again while this one was under way
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(DeleteAsync), key, ex);
        }
        _fallbacks.Add(1, new KeyValuePair<string, object?>("operation", operation), new KeyValuePair<string, object?>("reason", "pending_delete"));
        return false;
    }

    private void OnFallback(string operation, string key, Exception ex)
    {
        var refused = _breaker.IsRefusal(ex);
        _fallbacks.Add(1, new KeyValuePair<string, object?>("operation", operation), new KeyValuePair<string, object?>("reason", refused ? "breaker_open" : "primary_failure"));
        if (!refused) LogCachePrimaryFailure(_logger, ex, operation, key, _breaker.IsOpen);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Cache primary failure on {Operation} for key '{Key}'. Falling back to local cache. BreakerOpen={BreakerOpen}")]
    private static partial void LogCachePrimaryFailure(ILogger logger, Exception exception, string operation, string key, bool breakerOpen);
}
