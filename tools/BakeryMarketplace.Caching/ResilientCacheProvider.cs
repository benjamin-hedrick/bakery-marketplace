using Microsoft.Extensions.Logging;
using Polly.CircuitBreaker;

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
/// This decorator is vendor-agnostic. It doesn't care what backs the primary provider.
/// </summary>
public sealed class ResilientCacheProvider : ICacheProvider
{
    private readonly ICacheProvider _primary;
    private readonly ICacheProvider _fallback;
    private readonly ICircuitBreakerPolicy _breaker;
    private readonly ILogger<ResilientCacheProvider> _logger;

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
    }

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        try
        {
            return await _breaker.ExecuteAsync(
                token => _primary.GetAsync<T>(key, token), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogFallback(nameof(GetAsync), key, ex);
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
            LogFallback(nameof(GetManyAsync), $"{keys.Count} keys", ex);
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
            LogFallback(nameof(SetAsync), key, ex);
            await _fallback.SetAsync(key, value, ttl, ct);
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
            LogFallback(nameof(DeleteAsync), key, ex);
            await _fallback.DeleteAsync(key, ct);
        }
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
            LogFallback(nameof(ExistsAsync), key, ex);
            return await _fallback.ExistsAsync(key, ct);
        }
    }

    private void LogFallback(string operation, string key, Exception ex)
    {
        _logger.LogWarning(ex,
            "Cache primary failure on {Operation} for key '{Key}'. Falling back to local cache. BreakerOpen={BreakerOpen}",
            operation, key, _breaker.IsOpen);
    }
}
