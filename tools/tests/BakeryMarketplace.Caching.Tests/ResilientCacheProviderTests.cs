using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Polly.CircuitBreaker;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Unit tests for <see cref="ResilientCacheProvider"/> — proves the circuit-breaker
/// fallback logic works correctly. See WI-CACHE-003.
/// </summary>
public sealed class ResilientCacheProviderTests
{
    private static (ResilientCacheProvider Resilient, LocalCacheProvider Fallback) BuildSut(
        ICacheProvider primary,
        int exceptionsBeforeBreaking = 1,
        TimeSpan? durationOfBreak = null)
    {
        var memoryCache = new MemoryCache(new MemoryCacheOptions());
        var fallback = new LocalCacheProvider(memoryCache);
        var breaker = new PollyCircuitBreakerPolicy(exceptionsBeforeBreaking,
            durationOfBreak ?? TimeSpan.FromSeconds(30));
        var logger = NullLogger<ResilientCacheProvider>.Instance;
        var resilient = new ResilientCacheProvider(primary, fallback, breaker, logger);
        return (resilient, fallback);
    }

    [Fact]
    public async Task PrimarySuccess_Passthrough_ReturnsValueFromPrimary()
    {
        // Arrange
        var memCache = new MemoryCache(new MemoryCacheOptions());
        var primary = new LocalCacheProvider(memCache);
        await primary.SetAsync("key", "primary-value");

        var (sut, _) = BuildSut(primary);

        // Act
        var result = await sut.GetAsync<string>("key");

        // Assert
        Assert.True(result.Found);
        Assert.Equal("primary-value", result.Value);
    }

    [Fact]
    public async Task PrimaryFailure_FallsBackToLocal()
    {
        // Arrange
        var failingPrimary = new AlwaysFailingCacheProvider();
        var (sut, fallback) = BuildSut(failingPrimary);

        // Pre-populate the fallback so we can verify routing
        await fallback.SetAsync("key", "fallback-value");

        // Act
        var result = await sut.GetAsync<string>("key");

        // Assert
        Assert.True(result.Found, "Should get value from fallback after primary fails.");
        Assert.Equal("fallback-value", result.Value);
    }

    [Fact]
    public async Task PrimaryRecovery_BreakerClosesAfterSuccessfulProbe()
    {
        // Arrange — breaker with very short open duration so we can test probe/close
        var failingPrimary = new ToggleCacheProvider();
        var (sut, _) = BuildSut(failingPrimary, exceptionsBeforeBreaking: 1,
            durationOfBreak: TimeSpan.FromMilliseconds(100));

        // Trip the breaker
        failingPrimary.ShouldFail = true;
        _ = await sut.GetAsync<string>("probe-key"); // triggers failure → breaker trips

        // Wait for the break duration to elapse (breaker moves to half-open)
        await Task.Delay(200);

        // Allow the primary to succeed
        failingPrimary.ShouldFail = false;
        await sut.SetAsync("probe-key", "recovered");

        // Act — a subsequent Get should come from primary (breaker is now closed)
        var result = await sut.GetAsync<string>("probe-key");

        // Assert
        Assert.True(result.Found);
        Assert.Equal("recovered", result.Value);
    }

    [Fact]
    public async Task GetMany_PrimaryFailure_FallsBackToLocal()
    {
        var (sut, fallback) = BuildSut(new AlwaysFailingCacheProvider());
        await fallback.SetAsync("a", "from-fallback");

        var result = await sut.GetManyAsync<string>(new[] { "a", "b" });

        Assert.Equal("from-fallback", Assert.Single(result).Value);
    }

    // ── Test doubles ─────────────────────────────────────────────────────────

    private sealed class AlwaysFailingCacheProvider : ICacheProvider
    {
        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task DeleteAsync(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
    }

    private sealed class ToggleCacheProvider : ICacheProvider
    {
        public bool ShouldFail { get; set; }
        private readonly Dictionary<string, object?> _store = new();

        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            return _store.TryGetValue(key, out var v)
                ? Task.FromResult(CacheResult.Hit((T)v!))
                : Task.FromResult(CacheResult.Miss<T>());
        }

        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            IReadOnlyDictionary<string, T> found = keys.Where(_store.ContainsKey).Distinct().ToDictionary(k => k, k => (T)_store[k]!);
            return Task.FromResult(found);
        }

        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            _store[key] = value;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string key, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            _store.Remove(key);
            return Task.CompletedTask;
        }

        public Task<bool> ExistsAsync(string key, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            return Task.FromResult(_store.ContainsKey(key));
        }
    }
}
