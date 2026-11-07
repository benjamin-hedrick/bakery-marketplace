using BakeryMarketplace.Eventing;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Consumer groups per service (register item 29) and redelivery of messages whose handler failed (register item 112). Real Redis only
/// (set REDIS_CONNECTION_STRING); never the in-memory transport.
/// </summary>
public sealed class RedisStreamDeliveryTests : IDisposable
{
    private static readonly TimeSpan Quick = TimeSpan.FromMilliseconds(200);

    private readonly Lazy<ConnectionMultiplexer> _redis = new(() => ConnectionMultiplexer.Connect(RedisFactAttribute.ConnectionString!));
    private readonly List<string> _keys = [];

    public void Dispose()
    {
        if (!_redis.IsValueCreated) return;
        foreach (var key in _keys) _redis.Value.GetDatabase().KeyDelete(key);
        _redis.Value.Dispose();
    }

    private string NewEventType()
    {
        var type = $"DeliveryTest{Guid.NewGuid():N}";
        _keys.Add($"events:{type}");
        _keys.Add($"events:{type}:dead-letter");
        return type;
    }

    private RedisStreamsEventTransport Transport(string? service = null, int attempts = 3) =>
        new(_redis.Value, maxDeliveryAttempts: attempts, serviceName: service, redeliverAfter: Quick);

    private static DomainEventEnvelope<string> Envelope(string type, string payload = "p") =>
        new(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", 1, payload);

    private static async Task Eventually(Func<bool> condition, int seconds = 10)
    {
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(50);
    }

    [RedisFact]
    public async Task AMessageWhoseHandlerFailedOnceIsDeliveredAgainAndSucceeds()
    {
        var type = NewEventType();
        var transport = Transport();
        var calls = 0;
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await transport.SubscribeAsync<string>(type, (_, _) =>
        {
            if (Interlocked.Increment(ref calls) == 1) throw new InvalidOperationException("first delivery fails");
            done.TrySetResult();
            return Task.CompletedTask;
        });

        await transport.PublishAsync(Envelope(type));
        await done.Task.WaitAsync(TimeSpan.FromSeconds(10));

        Assert.Equal(2, calls);
        await Eventually(() => _redis.Value.GetDatabase().StreamPending($"events:{type}", $"cg:{type}").PendingMessageCount == 0);
        Assert.Equal(0, _redis.Value.GetDatabase().StreamPending($"events:{type}", $"cg:{type}").PendingMessageCount);
        Assert.Equal(0, _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter"));
    }

    [RedisFact]
    public async Task AMessageThatKeepsFailingIsDeadLetteredAfterTheMaximumNumberOfDeliveries()
    {
        var type = NewEventType();
        var transport = Transport(attempts: 3);
        var calls = 0;
        await transport.SubscribeAsync<string>(type, (_, _) =>
        {
            Interlocked.Increment(ref calls);
            throw new InvalidOperationException("always fails");
        });

        await transport.PublishAsync(Envelope(type, "poison"));
        await Eventually(() => _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter") == 1);

        Assert.Equal(1, _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter"));
        Assert.Equal(3, calls);
        var dead = _redis.Value.GetDatabase().StreamRange($"events:{type}:dead-letter").Single();
        Assert.Equal("3", dead.Values.First(v => v.Name == "attempts").Value);
        Assert.Contains("poison", (string)dead.Values.First(v => v.Name == "envelope").Value!);
        Assert.Equal(0, _redis.Value.GetDatabase().StreamPending($"events:{type}", $"cg:{type}").PendingMessageCount);
    }

    [RedisFact]
    public async Task TwoServicesSubscribingToTheSameEventEachReceiveEveryMessage()
    {
        var type = NewEventType();
        var catalog = new List<string>();
        var ordering = new List<string>();
        await Transport("catalog-service").SubscribeAsync<string>(type, (e, _) => { lock (catalog) catalog.Add(e.Payload); return Task.CompletedTask; });
        await Transport("ordering-service").SubscribeAsync<string>(type, (e, _) => { lock (ordering) ordering.Add(e.Payload); return Task.CompletedTask; });
        var publisher = Transport();

        for (var i = 1; i <= 5; i++) await publisher.PublishAsync(Envelope(type, $"m{i}"));
        await Eventually(() => Count(catalog) == 5 && Count(ordering) == 5);

        Assert.Equal(["m1", "m2", "m3", "m4", "m5"], catalog.Order());
        Assert.Equal(["m1", "m2", "m3", "m4", "m5"], ordering.Order());
        var groups = _redis.Value.GetDatabase().StreamGroupInfo($"events:{type}").Select(g => g.Name).Order().ToArray();
        Assert.Equal([$"cg:catalog-service:{type}", $"cg:ordering-service:{type}"], groups);
    }

    [RedisFact]
    public async Task ANamedConsumerInsideOneServiceHasItsOwnGroupAndTheDefaultConsumerKeepsItsGroupName()
    {
        var type = NewEventType();
        var transport = Transport("ordering-service");
        var named = new List<string>();
        var plain = new List<string>();
        await transport.SubscribeAsync<string>(type, (e, _) => { lock (plain) plain.Add(e.Payload); return Task.CompletedTask; });
        await transport.SubscribeAsync<string>(type, (e, _) => { lock (named) named.Add(e.Payload); return Task.CompletedTask; }, consumerName: "pickup-fulfillment");

        for (var i = 1; i <= 5; i++) await transport.PublishAsync(Envelope(type, $"m{i}"));
        await Eventually(() => Count(plain) == 5 && Count(named) == 5);

        Assert.Equal(["m1", "m2", "m3", "m4", "m5"], plain.Order());
        Assert.Equal(["m1", "m2", "m3", "m4", "m5"], named.Order());
        var groups = _redis.Value.GetDatabase().StreamGroupInfo($"events:{type}").Select(g => g.Name).Order().ToArray();
        Assert.Equal([$"cg:ordering-service:{type}", $"cg:ordering-service:pickup-fulfillment:{type}"], groups);
    }

    [RedisFact]
    public async Task ADeadLetterNamesTheNamedConsumerThatGaveUp()
    {
        var type = NewEventType();
        var transport = Transport("ordering-service", attempts: 2);
        await transport.SubscribeAsync<string>(type, (_, _) => throw new InvalidOperationException("always fails"), consumerName: "pickup-fulfillment");

        await transport.PublishAsync(Envelope(type, "poison"));
        await Eventually(() => _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter") == 1);

        var dead = _redis.Value.GetDatabase().StreamRange($"events:{type}:dead-letter").Single();
        Assert.Equal("pickup-fulfillment", dead.Values.First(v => v.Name == "consumer").Value);
    }

    [RedisFact]
    public async Task TwoInstancesOfOneServiceShareTheWorkAndEachMessageIsHandledOnce()
    {
        var type = NewEventType();
        var handled = new List<string>();
        Task Handler(DomainEventEnvelope<string> e, CancellationToken _) { lock (handled) handled.Add(e.Payload); return Task.CompletedTask; }
        await Transport("catalog-service").SubscribeAsync<string>(type, Handler);
        await Transport("catalog-service").SubscribeAsync<string>(type, Handler);
        var publisher = Transport();

        for (var i = 1; i <= 6; i++) await publisher.PublishAsync(Envelope(type, $"m{i}"));
        await Eventually(() => Count(handled) >= 6);
        await Task.Delay(500); // a duplicate, if there were one, would have shown up by now

        Assert.Equal(["m1", "m2", "m3", "m4", "m5", "m6"], handled.Order());
    }

    [RedisFact]
    public async Task WithoutAServiceNameTheGroupKeepsItsOldPerEventTypeName()
    {
        var type = NewEventType();
        await Transport().SubscribeAsync<string>(type, (_, _) => Task.CompletedTask);

        Assert.Equal($"cg:{type}", Assert.Single(_redis.Value.GetDatabase().StreamGroupInfo($"events:{type}")).Name);
    }

    private static int Count(List<string> list)
    {
        lock (list) return list.Count;
    }
}
