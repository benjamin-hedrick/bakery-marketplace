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
            StackExchange.Redis.ConnectionMultiplexer.Connect(connectionString));

        services.AddSingleton<RedisCacheProvider>();
        services.AddSingleton<ICacheProvider>(sp => sp.GetRequiredService<RedisCacheProvider>());

        return services;
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
        services.AddSingleton<ICircuitBreakerPolicy>(_ =>
            new PollyCircuitBreakerPolicy(exceptionsBeforeBreaking, durationOfBreak));
        services.AddSingleton<ResilientCacheProvider>(sp =>
            new ResilientCacheProvider(
                sp.GetRequiredService<ICacheProvider>(),  // the primary (must be registered by caller)
                sp.GetRequiredService<LocalCacheProvider>(),
                sp.GetRequiredService<ICircuitBreakerPolicy>(),
                sp.GetRequiredService<ILogger<ResilientCacheProvider>>()));
        return services;
    }
}
