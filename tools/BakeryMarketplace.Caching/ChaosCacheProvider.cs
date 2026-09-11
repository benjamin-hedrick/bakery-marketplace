namespace BakeryMarketplace.Caching;

/// <summary>
/// Chaos decorator that injects failures into any <see cref="ICacheProvider"/> for testing purposes.
/// Used with <see cref="ResilientCacheProvider"/> to prove the circuit-breaker fallback actually works.
///
/// Production gating (hard requirement from ADR-0002):
/// This class cannot be instantiated when the runtime environment is Production.
/// Use <see cref="CachingServiceExtensions.AddChaosCacheProvider"/> for DI-wired creation,
/// or pass <c>isProduction: true</c> directly to the constructor to enforce the same gate.
///
/// Chaos is simulated entirely in-process — no real Redis outage is required.
/// </summary>
public sealed class ChaosCacheProvider : ICacheProvider
{
    private readonly ICacheProvider _inner;
    private readonly ChaosOptions _options;
    private readonly Random _random;
    private readonly DateTimeOffset? _outageEnd;

    /// <param name="inner">The wrapped provider to inject chaos into.</param>
    /// <param name="options">Chaos configuration.</param>
    /// <param name="isProduction">
    /// Pass <c>true</c> if the current environment is Production.
    /// The constructor will throw <see cref="InvalidOperationException"/> in that case,
    /// making chaos structurally impossible to enable in production.
    /// </param>
    public ChaosCacheProvider(ICacheProvider inner, ChaosOptions options, bool isProduction)
    {
        if (isProduction)
            throw new InvalidOperationException(
                "ChaosCacheProvider cannot be used in the Production environment. " +
                "This is a hard safety gate per ADR-0002, not a configuration oversight.");

        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _random = new Random();

        if (_options.OutageWindow.HasValue)
            _outageEnd = DateTimeOffset.UtcNow + _options.OutageWindow.Value;
    }

    private bool IsInOutageWindow =>
        _outageEnd.HasValue && DateTimeOffset.UtcNow < _outageEnd.Value;

    private async Task InjectChaosAsync(CancellationToken ct)
    {
        if (_options.InjectedLatency.HasValue)
            await Task.Delay(_options.InjectedLatency.Value, ct);

        if (IsInOutageWindow)
            throw new InvalidOperationException("ChaosCacheProvider: simulated outage window is active.");

        if (_options.FailureRate > 0 && _random.NextDouble() < _options.FailureRate)
            throw new InvalidOperationException("ChaosCacheProvider: simulated random failure.");
    }

    public async Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
    {
        await InjectChaosAsync(ct);
        return await _inner.GetAsync<T>(key, ct);
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        await InjectChaosAsync(ct);
        await _inner.SetAsync(key, value, ttl, ct);
    }

    public async Task DeleteAsync(string key, CancellationToken ct = default)
    {
        await InjectChaosAsync(ct);
        await _inner.DeleteAsync(key, ct);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken ct = default)
    {
        await InjectChaosAsync(ct);
        return await _inner.ExistsAsync(key, ct);
    }
}
