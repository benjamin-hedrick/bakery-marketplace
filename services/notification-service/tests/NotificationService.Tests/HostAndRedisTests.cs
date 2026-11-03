using BakeryMarketplace.Caching;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Contacts;
using NotificationService.Processing;
using NotificationService.Sending;
using StackExchange.Redis;

namespace NotificationService.Tests;

/// <summary>Runs only when REDIS_CONNECTION_STRING is set to a running Redis; otherwise it is reported as skipped, not passed.</summary>
public sealed class RedisFactAttribute : FactAttribute
{
    public static readonly string? ConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING");

    public RedisFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString)) Skip = "Set REDIS_CONNECTION_STRING (for example 127.0.0.1:6379) to run against Redis.";
    }
}

public sealed class HostTests
{
    private static WebApplicationFactory<Program> Host(string? backend, RecordingNotificationSender? sender = null) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            if (backend is not null) b.UseSetting("Events:Backend", backend);
            if (sender is not null) b.ConfigureServices(s => s.AddSingleton<INotificationSender>(sender));
        });

    [Fact]
    public async Task AnOrderPlacedEventReachesTheSeededCustomerThroughTheRealHost()
    {
        var sender = new RecordingNotificationSender();
        using var host = Host("inmemory", sender);
        using var client = host.CreateClient(); // starts the host and the hosted subscriptions
        var publisher = (IEventPublisher)host.Services.GetRequiredService<IEventSubscriber>();

        await publisher.PublishAsync(new DomainEventEnvelope<OrderPlacedPayload>(
            Guid.NewGuid(), "OrderPlaced", 1, DateTimeOffset.UtcNow, "Order", "order-42", 1,
            new OrderPlacedPayload("order-42", "user-customer-1", "vendor-shop-001", [])));

        var message = Assert.Single(sender.Sent);
        Assert.Equal("alice@customer.local", message.ToAddress);
        Assert.Equal("order-42", message.OrderId);
    }

    [Fact]
    public async Task AWholeOrderLifecycleProducesTheFiveExpectedMessagesInOrder()
    {
        var sender = new RecordingNotificationSender();
        using var host = Host("inmemory", sender);
        using var client = host.CreateClient();
        var publisher = (IEventPublisher)host.Services.GetRequiredService<IEventSubscriber>();
        const string order = "order-lifecycle-77";
        var start = DateTimeOffset.UtcNow;
        var window = FulfillmentDetails.ForPickup(start.AddHours(1), start.AddHours(2));
        long seq = 0;
        Task Publish<T>(string type, T payload) => publisher.PublishAsync(
            new DomainEventEnvelope<T>(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Order", order, ++seq, payload));

        await Publish("OrderPlaced", new OrderPlacedPayload(order, "user-customer-1", "v1", [], 900, "GBP", FulfillmentType.Pickup, window));
        await Publish("OrderConfirmed", new OrderConfirmedPayload(order, CustomerId: "user-customer-1"));
        await Publish("OrderPreparationStarted", new OrderPreparationStartedPayload(order, CustomerId: "user-customer-1"));
        await Publish("OrderReadyForFulfillment", new OrderReadyForFulfillmentPayload(order, "v1", FulfillmentType.Pickup, window, "user-customer-1"));
        await Publish("OrderCompleted", new OrderCompletedPayload(order, DateTimeOffset.UtcNow, CustomerId: "user-customer-1"));

        Assert.Equal(
            ["OrderPlaced", "OrderConfirmed", "OrderPreparationStarted", "OrderReadyForFulfillment", "OrderCompleted"],
            sender.Sent.Select(n => n.EventType));
        Assert.All(sender.Sent, n => Assert.Equal("alice@customer.local", n.ToAddress));
        Assert.Contains("is ready for pickup", sender.Sent.ElementAt(3).Body);
    }

    [Fact]
    public void TheServiceRefusesToStartWithoutAnEventsBackend()
    {
        // Development's appsettings choose redis, so run as Production, where nothing is configured.
        using var host = Host(backend: null).WithWebHostBuilder(b => b.UseEnvironment("Production"));
        var e = Assert.ThrowsAny<Exception>(() => host.CreateClient());
        Assert.Contains("Events:Backend", e.ToString());
    }
}

public sealed class RedisBatchTests : IDisposable
{
    private readonly Lazy<ConnectionMultiplexer> _redis = new(() => ConnectionMultiplexer.Connect(RedisFactAttribute.ConnectionString!));
    private readonly List<string> _keys = [];

    public void Dispose()
    {
        if (!_redis.IsValueCreated) return;
        foreach (var key in _keys) _redis.Value.GetDatabase().KeyDelete(key);
        _redis.Value.Dispose();
    }

    [RedisFact]
    public async Task ThreeOrdersPlacedTogetherAreOnePollAndOneContactRead_AgainstRealRedis()
    {
        var db = _redis.Value.GetDatabase();
        var service = $"nt{Guid.NewGuid():N}";
        var transport = new RedisStreamsEventTransport(_redis.Value, serviceName: service);
        var cache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var directory = new CountingDirectory(SeededContactDirectoryTests.Seed());
        var sender = new RecordingNotificationSender();
        var notifier = new OrderEventNotifier(
            new CachedContactDirectory(directory, cache, NullLogger<CachedContactDirectory>.Instance),
            new TemplateMessageComposer(), sender, new SentLedger(cache), NullLogger<OrderEventNotifier>.Instance);

        // Seed the stream with three events before subscribing, so the first poll reads all three. A fresh event type keeps the
        // test independent of anything else in Redis.
        var type = $"OrderPlacedTest{Guid.NewGuid():N}";
        _keys.Add($"events:{type}");
        _keys.Add($"events:{type}:dead-letter");
        foreach (var n in Enumerable.Range(1, 3))
            await transport.PublishAsync(new DomainEventEnvelope<OrderPlacedPayload>(
                Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Order", $"o{n}", 1,
                new OrderPlacedPayload($"o{n}", n == 2 ? "c2" : "c1", "v", [])));

        await transport.SubscribeBatchAsync<OrderPlacedPayload>(type,
            (events, ct) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, ct));

        var until = DateTime.UtcNow.AddSeconds(10);
        while (sender.Sent.Count < 3 && DateTime.UtcNow < until) await Task.Delay(50);

        Assert.Equal(3, sender.Sent.Count);
        var read = Assert.Single(directory.Calls);       // one batch read for the whole poll
        Assert.Equal(["c1", "c2"], read.OrderBy(x => x));
        // The messages are sent before they are acknowledged, so wait for the acknowledgements.
        while (db.StreamPending($"events:{type}", $"cg:{service}:{type}").PendingMessageCount > 0 && DateTime.UtcNow < until) await Task.Delay(50);
        var pending = db.StreamPending($"events:{type}", $"cg:{service}:{type}");
        Assert.Equal(0, pending.PendingMessageCount);     // each entry acknowledged
    }
}
