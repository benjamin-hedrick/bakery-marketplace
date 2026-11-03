using BakeryMarketplace.Eventing;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Batch subscriptions (<see cref="IEventSubscriber.SubscribeBatchAsync{T}"/>, NOT-001): events published together reach the handler
/// together, entries are acknowledged one by one, and a failed entry is redelivered and dead-lettered like a single delivery.
/// Real Redis only (set REDIS_CONNECTION_STRING).
/// </summary>
public sealed class RedisBatchDeliveryTests : IDisposable
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
        var type = $"BatchTest{Guid.NewGuid():N}";
        _keys.Add($"events:{type}");
        _keys.Add($"events:{type}:dead-letter");
        return type;
    }

    private RedisStreamsEventTransport Transport(int attempts = 3) =>
        new(_redis.Value, maxDeliveryAttempts: attempts, serviceName: "batch-test", redeliverAfter: Quick);

    private static DomainEventEnvelope<string> Envelope(string type, string payload) =>
        new(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", 1, payload);

    private static async Task Eventually(Func<bool> condition, int seconds = 10)
    {
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(50);
    }

    private long Pending(string type) =>
        _redis.Value.GetDatabase().StreamPending($"events:{type}", $"cg:batch-test:{type}").PendingMessageCount;

    [RedisFact]
    public async Task EventsPublishedBeforeTheFirstPollArriveInOneBatchAndAreAcknowledged()
    {
        var type = NewEventType();
        var transport = Transport();
        foreach (var n in Enumerable.Range(1, 4)) await transport.PublishAsync(Envelope(type, $"m{n}"));

        var batches = new List<int>();
        await transport.SubscribeBatchAsync<string>(type, (events, _) =>
        {
            lock (batches) batches.Add(events.Count);
            return Task.FromResult<IReadOnlyCollection<Guid>>([]);
        });

        await Eventually(() => { lock (batches) return batches.Sum() == 4; });
        lock (batches) Assert.Equal(new[] { 4 }, batches);
        await Eventually(() => Pending(type) == 0);
        Assert.Equal(0, Pending(type));
    }

    [RedisFact]
    public async Task OnlyTheEntriesTheHandlerReportsAsFailedAreDeliveredAgain()
    {
        var type = NewEventType();
        var transport = Transport();
        var good = Envelope(type, "good");
        var bad = Envelope(type, "bad");
        await transport.PublishAsync(good);
        await transport.PublishAsync(bad);

        var seen = new List<string>();
        var badCalls = 0;
        await transport.SubscribeBatchAsync<string>(type, (events, _) =>
        {
            lock (seen) seen.AddRange(events.Select(e => e.Payload));
            var failed = events.Where(e => e.EventId == bad.EventId && Interlocked.Increment(ref badCalls) == 1)
                .Select(e => e.EventId).ToList();
            return Task.FromResult<IReadOnlyCollection<Guid>>(failed);
        });

        await Eventually(() => { lock (seen) return seen.Count(p => p == "bad") >= 2; });
        lock (seen)
        {
            Assert.Equal(1, seen.Count(p => p == "good"));   // acknowledged the first time, never redelivered
            Assert.Equal(2, seen.Count(p => p == "bad"));    // failed once, then delivered again
        }
        await Eventually(() => Pending(type) == 0);
        Assert.Equal(0, Pending(type));
    }

    [RedisFact]
    public async Task AHandlerThatThrowsFailsTheWholeBatchAndIsDeadLetteredAtTheMaximum()
    {
        var type = NewEventType();
        var transport = Transport(attempts: 2);
        await transport.PublishAsync(Envelope(type, "a"));
        await transport.PublishAsync(Envelope(type, "b"));

        await transport.SubscribeBatchAsync<string>(type, (_, _) => throw new InvalidOperationException("down"));

        var db = _redis.Value.GetDatabase();
        await Eventually(() => db.StreamLength($"events:{type}:dead-letter") == 2);
        Assert.Equal(2, db.StreamLength($"events:{type}:dead-letter"));
        await Eventually(() => Pending(type) == 0);
        Assert.Equal(0, Pending(type));
    }
}
