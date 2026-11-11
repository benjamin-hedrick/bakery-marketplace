using BakeryMarketplace.Chaos;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// <see cref="ChaosEventTransport"/> around the real <see cref="RedisStreamsEventTransport"/> (WI-EVT-004): failing handlers must be redelivered
/// and finally dead-lettered by Redis itself, duplicates must reach the consumer, and a consumer that follows the rules (idempotent on
/// <c>EventId</c>, ignores stale sequence numbers) ends in the right state. Real Redis only (set REDIS_CONNECTION_STRING); skipped without it.
/// </summary>
public sealed class RedisChaosEventTransportTests : IDisposable
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
        var type = $"RedisChaos{Guid.NewGuid():N}";
        _keys.Add($"events:{type}");
        _keys.Add($"events:{type}:dead-letter");
        return type;
    }

    private (ChaosEventTransport Chaos, ChaosRuntime Runtime) Chaos(long seed, int attempts, params (string Setting, double Value)[] settings)
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("redis-chaos", seed, "events", settings));
        var redis = new RedisStreamsEventTransport(_redis.Value, maxDeliveryAttempts: attempts, redeliverAfter: Quick);
        return (new ChaosEventTransport(redis, redis, runtime), runtime);
    }

    private static DomainEventEnvelope<string> Envelope(string type, string payload, long sequence = 1) =>
        new(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", sequence, payload);

    private static async Task Eventually(Func<bool> condition, int seconds = 15)
    {
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(50);
    }

    private static int Count<T>(List<T> list)
    {
        lock (list) return list.Count;
    }

    [RedisFact]
    public async Task HandlersThatFailHalfTheTime_StillSeeEveryMessage_AfterRedelivery_AndNothingIsDeadLettered()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(7, 30, ("handlerFailureRate", 0.5));
        var handled = new List<string>();
        await chaos.SubscribeAsync<string>(type, (e, _) => { lock (handled) handled.Add(e.Payload); return Task.CompletedTask; });

        for (var i = 1; i <= 10; i++) await chaos.PublishAsync(Envelope(type, $"m{i}"));
        await Eventually(() => Count(handled) >= 10);

        Assert.Equal(Enumerable.Range(1, 10).Select(i => $"m{i}").Order(), handled.Distinct().Order());
        Assert.Equal(0, _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter"));
        Assert.True(runtime.Journal.Count("events", "handlerFailure") > 0, "chaos must actually have failed some handlers");
    }

    [RedisFact]
    public async Task BatchHandlersThatFailHalfTheTime_StillSeeEveryMessage_AfterRedelivery()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(11, 30, ("handlerFailureRate", 0.5));
        var handled = new List<string>();
        await chaos.SubscribeBatchAsync<string>(type, (batch, _) =>
        {
            lock (handled) handled.AddRange(batch.Select(e => e.Payload));
            return Task.FromResult<IReadOnlyCollection<Guid>>(Array.Empty<Guid>());
        });

        for (var i = 1; i <= 10; i++) await chaos.PublishAsync(Envelope(type, $"m{i}"));
        await Eventually(() => handled.Distinct().Count() >= 10);

        Assert.Equal(Enumerable.Range(1, 10).Select(i => $"m{i}").Order(), handled.Distinct().Order());
        Assert.Equal(0, _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter"));
        Assert.True(runtime.Journal.Count("events", "handlerFailure") > 0, "chaos must actually have failed some handlers");
    }

    [RedisFact]
    public async Task AHandlerThatAlwaysFails_IsDeadLetteredAfterTheMaximumAttempts_WithoutTheHandlerRunning()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(1, 2, ("handlerFailureRate", 1.0));
        var ran = 0;
        await chaos.SubscribeAsync<string>(type, (_, _) => { Interlocked.Increment(ref ran); return Task.CompletedTask; });

        await chaos.PublishAsync(Envelope(type, "poison"));
        await Eventually(() => _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter") == 1);

        Assert.Equal(1, _redis.Value.GetDatabase().StreamLength($"events:{type}:dead-letter"));
        Assert.Equal(2, runtime.Journal.Count("events", "handlerFailure")); // the maximum attempts, each failed by chaos
        Assert.Equal(0, ran);
    }

    [RedisFact]
    public async Task ADuplicatedEvent_ReachesTheConsumerTwice_AndAnIdempotentConsumerAppliesItOnce()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(1, 3, ("duplicateRate", 1.0));
        var deliveries = new List<Guid>();
        var applied = new HashSet<Guid>();
        await chaos.SubscribeAsync<string>(type, (e, _) =>
        {
            lock (deliveries) deliveries.Add(e.EventId);
            lock (applied) applied.Add(e.EventId); // idempotent on EventId, as ADR-0003 requires
            return Task.CompletedTask;
        });

        await chaos.PublishAsync(Envelope(type, "once"));
        await Eventually(() => Count(deliveries) >= 2);

        Assert.Equal(1, runtime.Journal.Count("events", "duplicate"));
        Assert.Equal(2, Count(deliveries));
        Assert.Single(applied);
    }

    [RedisFact]
    public async Task OutOfOrderEvents_ReachRedisInTheWrongOrder_AndAConsumerThatChecksSequenceNumbersKeepsTheNewestState()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(1, 3, ("reorderRate", 1.0));
        var arrival = new List<long>();
        long highest = 0;
        await chaos.SubscribeAsync<string>(type, (e, _) =>
        {
            lock (arrival)
            {
                arrival.Add(e.SequenceNumber);
                highest = Math.Max(highest, e.SequenceNumber); // a stale event never lowers the state
            }
            return Task.CompletedTask;
        });

        await chaos.PublishAsync(Envelope(type, "v1", 1));
        await chaos.PublishAsync(Envelope(type, "v2", 2));
        await Eventually(() => Count(arrival) >= 2);

        Assert.Equal(1, runtime.Journal.Count("events", "reorder"));
        Assert.Equal([2L, 1L], arrival);
        Assert.Equal(2, highest);
    }

    [RedisFact]
    public async Task APublishOutageStopsEventsReachingRedis_AndTheyFlowAgainAfterIt()
    {
        var type = NewEventType();
        var (chaos, runtime) = Chaos(1, 3, ("outageWindowSeconds", 0.3));
        var handled = new List<string>();
        await chaos.SubscribeAsync<string>(type, (e, _) => { lock (handled) handled.Add(e.Payload); return Task.CompletedTask; });

        await Assert.ThrowsAsync<EventTransportException>(() => chaos.PublishAsync(Envelope(type, "during")));
        Assert.Equal(1, runtime.Journal.Count("events", "outage"));
        Assert.Equal(0, _redis.Value.GetDatabase().StreamLength($"events:{type}")); // nothing reached the stream

        await Task.Delay(400);
        await chaos.PublishAsync(Envelope(type, "after"));
        await Eventually(() => Count(handled) >= 1);

        Assert.Equal(["after"], handled);
    }
}
