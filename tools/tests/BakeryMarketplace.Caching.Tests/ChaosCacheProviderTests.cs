using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Tests for <see cref="ChaosCacheProvider"/> and its integration with <see cref="ResilientCacheProvider"/>.
/// Proves the circuit-breaker fallback actually fires under injected chaos, and that
/// the production-environment gating works as a hard startup gate. See WI-CACHE-004.
/// </summary>
public sealed class ChaosCacheProviderTests
{
    private static (ResilientCacheProvider Resilient, LocalCacheProvider Fallback, FakeLogCollector Logger)
        BuildSutWithChaos(ChaosOptions chaosOptions, ICacheProvider chaosInner)
    {
        var memCache = new MemoryCache(new MemoryCacheOptions());
        var fallback = new LocalCacheProvider(memCache);
        var chaos = new ChaosCacheProvider(chaosInner, chaosOptions, isProduction: false);
        var breaker = new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 1,
            durationOfBreak: TimeSpan.FromMilliseconds(100));
        var logCollector = new FakeLogCollector();
        var logger = new FakeLogger<ResilientCacheProvider>(logCollector);
        var resilient = new ResilientCacheProvider(chaos, fallback, breaker, logger);
        return (resilient, fallback, logCollector);
    }

    [Fact]
    public async Task OutageWindow_CausesCallsToFallBackToLocalCache()
    {
        // Arrange — chaos with an outage window long enough that calls during the test hit it
        var innerCache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var chaosOpts = new ChaosOptions { OutageWindow = TimeSpan.FromSeconds(10) };
        var (sut, fallback, _) = BuildSutWithChaos(chaosOpts, innerCache);

        // Pre-populate fallback
        await fallback.SetAsync("key", "from-fallback");

        // Act — primary is chaos-wrapped (will throw for 10s), so fallback should serve
        var result = await sut.GetAsync<string>("key");

        // Assert
        Assert.True(result.Found, "Result should come from LocalCacheProvider fallback.");
        Assert.Equal("from-fallback", result.Value);
    }

    [Fact]
    public async Task OutageWindow_LogWarningFiredOnFallback()
    {
        // Arrange
        var innerCache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var chaosOpts = new ChaosOptions { OutageWindow = TimeSpan.FromSeconds(10) };
        var (sut, _, logCollector) = BuildSutWithChaos(chaosOpts, innerCache);

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
        var chaosOpts = new ChaosOptions { OutageWindow = TimeSpan.FromMilliseconds(150) };
        var (sut, _, _) = BuildSutWithChaos(chaosOpts, innerCache);

        // Trip the breaker during the outage
        _ = await sut.GetAsync<string>("any-key");

        // Wait for: outage window (150ms) + breaker open duration (100ms) + buffer (100ms)
        await Task.Delay(400);

        // Act — chaos outage is over, breaker should probe and close; write + read back
        await sut.SetAsync("recovery-key", "recovered-value");
        var result = await sut.GetAsync<string>("recovery-key");

        // Assert
        Assert.True(result.Found, "After outage and breaker recovery, primary should serve reads.");
    }

    [Fact]
    public void ProductionGating_ThrowsAtConstruction_WhenIsProductionTrue()
    {
        // Arrange
        var inner = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var opts = new ChaosOptions { FailureRate = 1.0 };

        // Act & Assert — must throw immediately; structurally impossible in production
        Assert.Throws<InvalidOperationException>(() =>
            new ChaosCacheProvider(inner, opts, isProduction: true));
    }

    [Fact]
    public void ProductionGating_AddChaosCacheProvider_ThrowsForProductionEnvironment()
    {
        // Arrange
        var services = new Microsoft.Extensions.DependencyInjection.ServiceCollection();
        var inner = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var opts = new ChaosOptions { FailureRate = 1.0 };
        var prodEnv = new FakeHostEnvironment { EnvironmentName = "Production" };

        // Act & Assert — the DI extension must also fail fast at registration time
        Assert.Throws<InvalidOperationException>(() =>
            services.AddChaosCacheProvider(inner, opts, prodEnv));
    }

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

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Development";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
