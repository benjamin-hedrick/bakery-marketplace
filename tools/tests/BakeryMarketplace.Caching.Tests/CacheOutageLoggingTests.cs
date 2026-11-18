using System.Diagnostics.Metrics;
using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Register 205: during a cache Redis outage the fallback logged one warning with a stack trace per cache call (300,915 in a minute under load) and every
/// read waited about 5 s at the start. Now a refused call is counted, not logged; the breaker logs that it opened; and the cache connection fails fast.
/// </summary>
public sealed class CacheOutageLoggingTests
{
    private sealed class DownPrimary : ICacheProvider
    {
        public int Calls;
        private Task<T> Fail<T>() { Calls++; return Task.FromException<T>(new InvalidOperationException("primary down")); }
        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default) => Fail<CacheResult<T>>();
        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default) => Fail<IReadOnlyDictionary<string, T>>();
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) => Fail<bool>();
        public Task<bool> SetIfAbsentAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) => Fail<bool>();
        public Task DeleteAsync(string key, CancellationToken ct = default) => Fail<bool>();
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => Fail<bool>();
    }

    private sealed class Captured<T> : ILogger<T>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }

    [Fact]
    public async Task WhileTheBreakerIsOpen_RefusedCallsAreCountedNotLogged_AndTheBreakerLogsItsOpeningOnce()
    {
        var primary = new DownPrimary();
        var providerLog = new Captured<ResilientCacheProvider>();
        var breakerLog = new Captured<PollyCircuitBreakerPolicy>();
        using var sut = new ResilientCacheProvider(
            primary, new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())),
            new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 3, durationOfBreak: TimeSpan.FromMinutes(5), logger: breakerLog), providerLog);
        var reasons = new List<string?>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, l) =>
        {
            if (ReferenceEquals(instrument.Meter, sut.Meter)) l.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<long>((_, _, tags, _) =>
        {
            foreach (var tag in tags) if (tag.Key == "reason") reasons.Add(tag.Value as string);
        });
        listener.Start();

        for (var i = 0; i < 50; i++) Assert.False((await sut.GetAsync<string>($"key-{i}")).Found);

        Assert.Equal(3, primary.Calls); // the breaker opened after three failures; the other 47 never reached the primary
        Assert.Equal(3, providerLog.Entries.Count(e => e.Level == LogLevel.Warning));
        Assert.Single(breakerLog.Entries, e => e.Level == LogLevel.Warning && e.Message.Contains("opened"));
        Assert.Equal(3, reasons.Count(r => r == "primary_failure"));
        Assert.Equal(47, reasons.Count(r => r == "breaker_open"));
    }

    [Fact]
    public void ACacheConnectionFailsFastAndWaitsAtMostASecond_UnlessTheConnectionStringSaysOtherwise()
    {
        var defaults = CachingServiceExtensions.CacheConnectionOptions("localhost:6380");
        Assert.Equal(StackExchange.Redis.BacklogPolicy.FailFast, defaults.BacklogPolicy);
        Assert.Equal(CachingServiceExtensions.CacheTimeoutMilliseconds, defaults.ConnectTimeout);
        Assert.Equal(CachingServiceExtensions.CacheTimeoutMilliseconds, defaults.SyncTimeout);
        Assert.Equal(CachingServiceExtensions.CacheTimeoutMilliseconds, defaults.AsyncTimeout);
        Assert.False(defaults.AbortOnConnectFail);

        var stated = CachingServiceExtensions.CacheConnectionOptions("localhost:6380,syncTimeout=2500,asyncTimeout=3000,connectTimeout=4000,abortConnect=true");
        Assert.Equal(2500, stated.SyncTimeout);
        Assert.Equal(3000, stated.AsyncTimeout);
        Assert.Equal(4000, stated.ConnectTimeout);
        Assert.True(stated.AbortOnConnectFail);
        Assert.Equal(StackExchange.Redis.BacklogPolicy.FailFast, stated.BacklogPolicy);
    }
}
