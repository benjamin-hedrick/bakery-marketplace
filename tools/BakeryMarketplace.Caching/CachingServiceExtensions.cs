using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Caching;

/// <summary>
/// DI extension methods for caching services.
/// </summary>
public static class CachingServiceExtensions
{
    /// <summary>
    /// Registers <see cref="LocalCacheProvider"/> with DI.
    /// </summary>
    public static IServiceCollection AddLocalCacheProvider(this IServiceCollection services)
    {
        services.AddMemoryCache();
        services.AddSingleton<LocalCacheProvider>();
        return services;
    }

    /// <summary>
    /// Registers <see cref="RedisCacheProvider"/> with DI using a connection string.
    /// </summary>
    public static IServiceCollection AddRedisCacheProvider(
        this IServiceCollection services,
        string connectionString)
    {
        if (string.IsNullOrEmpty(connectionString))
            throw new ArgumentException("Redis connection string cannot be null or empty.", nameof(connectionString));

        services.AddSingleton<StackExchange.Redis.IConnectionMultiplexer>(_ =>
            StackExchange.Redis.ConnectionMultiplexer.Connect(CacheConnectionOptions(connectionString)));

        services.AddSingleton<RedisCacheProvider>();
        services.AddSingleton<ICacheProvider>(sp => sp.GetRequiredService<RedisCacheProvider>());

        return services;
    }

    /// <summary>The time a cache call may wait for Redis when the connection string does not say (register 205).</summary>
    public const int CacheTimeoutMilliseconds = 1000;

    /// <summary>
    /// The options of a cache connection (register 205). A cache is worth less than a wait, so: a command fails at once while the connection is
    /// down instead of queueing until a timeout (<c>BacklogPolicy.FailFast</c>; the default queued every read for about 5 s at the start of an
    /// outage, long enough for ordering's call to the catalog to time out); connect, sync and async timeouts of
    /// <see cref="CacheTimeoutMilliseconds"/> unless the connection string sets them; and the service starts without Redis (<c>abortConnect=false</c>)
    /// unless the connection string says otherwise. The circuit breaker and the local fallback do the rest (ADR-0002).
    /// </summary>
    public static StackExchange.Redis.ConfigurationOptions CacheConnectionOptions(string connectionString)
    {
        var options = StackExchange.Redis.ConfigurationOptions.Parse(connectionString);
        bool Says(string name) => connectionString.Contains(name + "=", StringComparison.OrdinalIgnoreCase);
        if (!Says("connectTimeout")) options.ConnectTimeout = CacheTimeoutMilliseconds;
        if (!Says("syncTimeout")) options.SyncTimeout = CacheTimeoutMilliseconds;
        if (!Says("asyncTimeout")) options.AsyncTimeout = CacheTimeoutMilliseconds;
        if (!Says("abortConnect")) options.AbortOnConnectFail = false;
        options.BacklogPolicy = StackExchange.Redis.BacklogPolicy.FailFast;
        return options;
    }

    /// <summary>
    /// Registers a <see cref="ResilientCacheProvider"/> that wraps the given primary provider,
    /// falling back to <see cref="LocalCacheProvider"/> using a Polly circuit breaker.
    /// </summary>
    public static IServiceCollection AddResilientCacheProvider(
        this IServiceCollection services,
        int exceptionsBeforeBreaking = 3,
        TimeSpan? durationOfBreak = null)
    {
        services.AddLocalCacheProvider();
        services.AddSingleton<ICircuitBreakerPolicy>(sp =>
            new PollyCircuitBreakerPolicy(exceptionsBeforeBreaking, durationOfBreak, sp.GetService<ILogger<PollyCircuitBreakerPolicy>>()));
        services.AddSingleton<ResilientCacheProvider>(sp =>
            new ResilientCacheProvider(
                sp.GetRequiredService<ICacheProvider>(),  // the primary (must be registered by caller)
                sp.GetRequiredService<LocalCacheProvider>(),
                sp.GetRequiredService<ICircuitBreakerPolicy>(),
                sp.GetRequiredService<ILogger<ResilientCacheProvider>>()));
        return services;
    }
}
