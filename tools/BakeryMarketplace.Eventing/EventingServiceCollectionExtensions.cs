using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing;

/// <summary>The one place a service chooses its event backend (ADR-0003), so catalog, ordering and notification wire it identically.</summary>
public static class EventingServiceCollectionExtensions
{
    /// <summary>
    /// Registers <see cref="IEventPublisher"/> and <see cref="IEventSubscriber"/> for the backend named by <c>Events:Backend</c>: "redis" (Redis Streams,
    /// with the logger of the host, so failures are reported) or "inmemory" (tests and throwaway runs). There is no default, because silently falling
    /// back to in-memory would drop every event while looking healthy. Also registers the live-stream broadcast when <paramref name="withBroadcast"/> is set.
    /// Returns the Redis connection when the backend is Redis (so a service can share it for its cache), otherwise null.
    /// </summary>
    public static IConnectionMultiplexer? AddBakeryEvents(
        this IServiceCollection services,
        IConfiguration configuration,
        string serviceName,
        bool withBroadcast = false)
    {
        var backend = configuration["Events:Backend"];
        if (string.Equals(backend, "redis", StringComparison.OrdinalIgnoreCase))
        {
            var redis = ConnectionMultiplexer.Connect(configuration["Redis:ConnectionString"] ?? "localhost:6379");
            var maxStreamLength = configuration.GetValue<int?>("Events:MaxStreamLength");
            services.AddSingleton(sp => new RedisStreamsEventTransport(
                redis,
                maxStreamLength: maxStreamLength,
                serviceName: serviceName,
                logger: sp.GetRequiredService<ILoggerFactory>().CreateLogger<RedisStreamsEventTransport>()));
            services.AddSingleton<IEventPublisher>(sp => sp.GetRequiredService<RedisStreamsEventTransport>());
            services.AddSingleton<IEventSubscriber>(sp => sp.GetRequiredService<RedisStreamsEventTransport>());
            if (withBroadcast)
            {
                // Pub/Sub on the same connection (ADR-0021)
                services.AddSingleton(sp => new RedisBroadcast(redis, sp.GetRequiredService<ILoggerFactory>().CreateLogger<RedisBroadcast>()));
                services.AddSingleton<IBroadcastPublisher>(sp => sp.GetRequiredService<RedisBroadcast>());
                services.AddSingleton<IBroadcastSubscriber>(sp => sp.GetRequiredService<RedisBroadcast>());
            }
            return redis;
        }

        if (string.Equals(backend, "inmemory", StringComparison.OrdinalIgnoreCase))
        {
            var transport = new InMemoryEventTransport();
            services.AddSingleton<IEventPublisher>(transport);
            services.AddSingleton<IEventSubscriber>(transport);
            if (withBroadcast)
            {
                services.AddSingleton(sp => new InMemoryBroadcast(sp.GetRequiredService<ILoggerFactory>().CreateLogger<InMemoryBroadcast>()));
                services.AddSingleton<IBroadcastPublisher>(sp => sp.GetRequiredService<InMemoryBroadcast>());
                services.AddSingleton<IBroadcastSubscriber>(sp => sp.GetRequiredService<InMemoryBroadcast>());
            }
            return null;
        }

        throw new InvalidOperationException("Events:Backend must be set to 'redis' or 'inmemory'. There is no default, so events are never lost silently.");
    }
}
