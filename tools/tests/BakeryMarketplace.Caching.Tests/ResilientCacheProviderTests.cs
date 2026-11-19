using System.Diagnostics.Metrics;
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

    [Fact]
    public async Task ASuccessfulDeleteAlsoRemovesTheCopyTheFallbackHolds()
    {
        // The fallback was filled while the breaker was open; the primary is healthy again and the key is invalidated. The stale fallback copy must go too,
        // or it would be served if the breaker opened again.
        var primary = new ToggleCacheProvider();
        var fallback = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var breaker = new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 5, durationOfBreak: TimeSpan.FromSeconds(30));
        var sut = new ResilientCacheProvider(primary, fallback, breaker, NullLogger<ResilientCacheProvider>.Instance);
        await fallback.SetAsync("k", "stale-in-fallback");

        await sut.DeleteAsync("k");

        Assert.False((await fallback.GetAsync<string>("k")).Found);
    }

    // ── Register 184: a delete the primary did not take ──────────────────────

    [Fact]
    public async Task AfterAFailedDelete_TheOldPrimaryEntryIsNotServedAgainWhenTheBreakerCloses()
    {
        // The flap of register 184: the delete fails, the breaker opens and the fallback serves the new value; when the breaker closes, the primary's old
        // entry must not come back.
        var primary = new ToggleCacheProvider();
        await primary.SetAsync("k", "old");
        var breaker = new ManualBreaker();
        using var sut = new ResilientCacheProvider(
            primary, new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())), breaker, NullLogger<ResilientCacheProvider>.Instance);
        var reasons = new List<string?>();
        using var listener = ListenForReasons(sut, reasons);

        primary.ShouldFail = true;
        await sut.DeleteAsync("k");
        breaker.Open = true;
        await sut.SetAsync("k", "new");
        Assert.Equal("new", (await sut.GetAsync<string>("k")).Value);

        primary.ShouldFail = false;
        breaker.Open = false;
        var afterClose = await sut.GetAsync<string>("k");

        Assert.False(afterClose.Found, $"expected a miss once the delete reached the primary, got '{afterClose.Value}'");
        Assert.False(primary.Holds("k"));
        Assert.Empty(sut.PendingDeletes);
        Assert.Equal(["primary_failure", "breaker_open", "pending_delete", "breaker_open", "pending_delete"], reasons);
    }

    [Fact]
    public async Task WhileTheDeleteStillFails_EveryCallForTheKeyUsesTheFallback_AndOtherKeysStillUseThePrimary()
    {
        var primary = new ToggleCacheProvider();
        await primary.SetAsync("k", "old");
        await primary.SetAsync("other", "o");
        using var sut = new ResilientCacheProvider(
            primary, new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())), new ManualBreaker(), NullLogger<ResilientCacheProvider>.Instance);

        primary.FailDeletes = true;
        await sut.DeleteAsync("k");

        Assert.Equal(["k"], sut.PendingDeletes);
        Assert.False((await sut.GetAsync<string>("k")).Found);
        Assert.False(await sut.ExistsAsync("k"));
        Assert.Equal(new Dictionary<string, string> { ["other"] = "o" }, await sut.GetManyAsync<string>(["k", "other"]));
        Assert.True(await sut.SetIfAbsentAsync("k", "fresh"));
        Assert.Equal("fresh", (await sut.GetAsync<string>("k")).Value); // from the fallback
        Assert.Equal("old", await primary.ValueOf("k")); // nothing was written over the primary's entry while the delete was pending

        primary.FailDeletes = false;
        Assert.False((await sut.GetAsync<string>("k")).Found); // the retried delete landed: the primary is used again, and the old entry is gone
        Assert.Empty(sut.PendingDeletes);
    }

    [Fact]
    public async Task ALaterDeleteThatReachesThePrimaryClearsTheMark()
    {
        var primary = new ToggleCacheProvider();
        using var sut = new ResilientCacheProvider(
            primary, new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())), new ManualBreaker(), NullLogger<ResilientCacheProvider>.Instance);

        primary.FailDeletes = true;
        await sut.DeleteAsync("k");
        primary.FailDeletes = false;
        await sut.DeleteAsync("k");
        await primary.SetAsync("k", "from-primary");

        Assert.Empty(sut.PendingDeletes);
        Assert.Equal("from-primary", (await sut.GetAsync<string>("k")).Value);
    }

    private static MeterListener ListenForReasons(ResilientCacheProvider sut, List<string?> reasons)
    {
        var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (ReferenceEquals(instrument.Meter, sut.Meter)) l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, _, tags, _) =>
        {
            foreach (var tag in tags) if (tag.Key == "reason") reasons.Add(tag.Value as string);
        });
        listener.Start();
        return listener;
    }

    // ── Test doubles ─────────────────────────────────────────────────────────

    /// <summary>A breaker the test opens and closes by hand, so no test waits on a clock.</summary>
    private sealed class ManualBreaker : ICircuitBreakerPolicy
    {
        public bool Open { get; set; }
        public bool IsOpen => Open;
        public Task ExecuteAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default) =>
            Open ? Task.FromException(new BrokenCircuitException("open")) : operation(ct);
        public Task<TResult> ExecuteAsync<TResult>(Func<CancellationToken, Task<TResult>> operation, CancellationToken ct = default) =>
            Open ? Task.FromException<TResult>(new BrokenCircuitException("open")) : operation(ct);
        public bool IsRefusal(Exception exception) => exception is BrokenCircuitException;
    }

    private sealed class AlwaysFailingCacheProvider : ICacheProvider
    {
        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task<bool> SetIfAbsentAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task DeleteAsync(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) =>
            throw new InvalidOperationException("Simulated primary failure.");
    }

    private sealed class ToggleCacheProvider : ICacheProvider
    {
        public bool ShouldFail { get; set; }
        public bool FailDeletes { get; set; }
        private readonly Dictionary<string, object?> _store = new();

        public bool Holds(string key) => _store.ContainsKey(key);
        public Task<object?> ValueOf(string key) => Task.FromResult(_store.GetValueOrDefault(key));

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

        public Task<bool> SetIfAbsentAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default)
        {
            if (ShouldFail) throw new InvalidOperationException("Toggled to fail.");
            return Task.FromResult(_store.TryAdd(key, value));
        }

        public Task DeleteAsync(string key, CancellationToken ct = default)
        {
            if (ShouldFail || FailDeletes) throw new InvalidOperationException("Toggled to fail.");
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
