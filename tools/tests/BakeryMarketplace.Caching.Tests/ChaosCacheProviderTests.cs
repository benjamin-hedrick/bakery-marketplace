using BakeryMarketplace.Caching;
using BakeryMarketplace.Chaos;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Tests for <see cref="ChaosCacheProvider"/> and its integration with <see cref="ResilientCacheProvider"/>.
/// Proves the circuit-breaker fallback actually fires under injected chaos, and that
/// the journal records the faults it injected. The production gate is tested with the runtime (BakeryMarketplace.Chaos.Tests). See WI-CACHE-004, ADR-0024.
/// </summary>
public sealed class ChaosCacheProviderTests
{
    private static (ResilientCacheProvider Resilient, LocalCacheProvider Fallback, FakeLogCollector Logger, ChaosRuntime Runtime)
        BuildSutWithChaos(ChaosRuntime runtime, ICacheProvider chaosInner)
    {
        var memCache = new MemoryCache(new MemoryCacheOptions());
        var fallback = new LocalCacheProvider(memCache);
        var chaos = new ChaosCacheProvider(chaosInner, runtime);
        var breaker = new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 1,
            durationOfBreak: TimeSpan.FromMilliseconds(100));
        var logCollector = new FakeLogCollector();
        var logger = new FakeLogger<ResilientCacheProvider>(logCollector);
        var resilient = new ResilientCacheProvider(chaos, fallback, breaker, logger);
        return (resilient, fallback, logCollector, runtime);
    }

    [Fact]
    public async Task OutageWindow_CausesCallsToFallBackToLocalCache()
    {
        // Arrange — chaos with an outage window long enough that calls during the test hit it
        var innerCache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var (sut, fallback, _, runtime) = BuildSutWithChaos(Outage(10), innerCache);

        // Pre-populate fallback
        await fallback.SetAsync("key", "from-fallback");

        // Act — primary is chaos-wrapped (will throw for 10s), so fallback should serve
        var result = await sut.GetAsync<string>("key");

        // Assert
        Assert.True(runtime.Journal.Count("cache", "outage") > 0, "chaos must actually have failed the primary");
        Assert.True(result.Found, "Result should come from LocalCacheProvider fallback.");
        Assert.Equal("from-fallback", result.Value);
    }

    [Fact]
    public async Task OutageWindow_LogWarningFiredOnFallback()
    {
        // Arrange
        var innerCache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var (sut, _, logCollector, _) = BuildSutWithChaos(Outage(10), innerCache);

        // Act
        _ = await sut.GetAsync<string>("any-key");

        // Assert — a warning should have been logged when the fallback was used
        Assert.Contains(logCollector.Messages, m => m.Contains("Falling back to local cache"));
    }

    [Fact]
    public async Task BreakerClosesAfterOutageWindowEnds()
    {
        // Arrange — very short outage window (150ms) so we can verify recovery
        var innerCache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var (sut, _, _, runtime) = BuildSutWithChaos(Outage(0.15), innerCache);

        // Trip the breaker during the outage
        _ = await sut.GetAsync<string>("any-key");

        // Wait for: outage window (150ms) + breaker open duration (100ms) + buffer (100ms)
        await Task.Delay(400);

        // Act — chaos outage is over, breaker should probe and close; write + read back
        await sut.SetAsync("recovery-key", "recovered-value");
        var result = await sut.GetAsync<string>("recovery-key");

        // Assert
        Assert.True(runtime.Journal.Count("cache", "outage") > 0, "the outage must have happened before the recovery means anything");
        Assert.True(result.Found, "After outage and breaker recovery, primary should serve reads.");
    }

    [Fact]
    public async Task SameSeedFailsTheSameOperations_AndAnotherSeedFailsOthers()
    {
        async Task<string> Run(long seed)
        {
            var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("t", seed, "cache", ("failureRate", 0.5)));
            var chaos = new ChaosCacheProvider(new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())), runtime);
            var outcome = "";
            for (var i = 0; i < 40; i++)
            {
                try { await chaos.GetAsync<string>($"key-{i}"); outcome += "o"; }
                catch (InvalidOperationException) { outcome += "x"; }
            }

            return outcome;
        }

        var first = await Run(5);
        Assert.Equal(first, await Run(5));
        Assert.NotEqual(first, await Run(6));
        Assert.Contains('o', first);
        Assert.Contains('x', first);
    }

    private static ChaosRuntime Outage(double seconds) =>
        ChaosRuntime.ForTests(ChaosScenario.Of("outage", 1, "cache", ("outageWindowSeconds", seconds)));

    // ── Test doubles ─────────────────────────────────────────────────────────

    private sealed class FakeLogCollector
    {
        public List<string> Messages { get; } = new();
        public void Add(string message) => Messages.Add(message);
    }

    private sealed class FakeLogger<T> : ILogger<T>
    {
        private readonly FakeLogCollector _collector;
        public FakeLogger(FakeLogCollector collector) => _collector = collector;

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
        {
            _collector.Add(formatter(state, exception));
        }
    }
}
