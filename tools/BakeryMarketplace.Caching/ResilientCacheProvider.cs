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

    /// <summary>This instance's meter (one per provider, so a test reads only its own).</summary>
    public Meter Meter => _meter;

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
            "cache_fallback", description: "Cache calls served by the fallback, by operation and reason (primary_failure or breaker_open)");
    }

    public void Dispose() => _meter.Dispose();

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
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
        try
        {
            await _breaker.ExecuteAsync(
                token => _primary.DeleteAsync(key, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            OnFallback(nameof(DeleteAsync), key, ex);
        }

        // Always the fallback too, not only when the primary failed: the fallback may hold a copy filled while the breaker was open, and a delete that reached
        // only the primary would leave that copy to be served (until its TTL) if the breaker opens again.
        await _fallback.DeleteAsync(key, ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
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

    private void OnFallback(string operation, string key, Exception ex)
    {
        var refused = _breaker.IsRefusal(ex);
        _fallbacks.Add(1, new KeyValuePair<string, object?>("operation", operation), new KeyValuePair<string, object?>("reason", refused ? "breaker_open" : "primary_failure"));
        if (!refused) LogCachePrimaryFailure(_logger, ex, operation, key, _breaker.IsOpen);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Cache primary failure on {Operation} for key '{Key}'. Falling back to local cache. BreakerOpen={BreakerOpen}")]
    private static partial void LogCachePrimaryFailure(ILogger logger, Exception exception, string operation, string key, bool breakerOpen);
}
