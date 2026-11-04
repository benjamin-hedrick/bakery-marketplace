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
    public async Task ABatchRunsInOneNewTraceLinkedToEachPublishersTrace()
    {
        var stopped = new List<string>();
        using var listener = new System.Diagnostics.ActivityListener
        {
            ShouldListenTo = source => source.Name == EventTracing.ActivitySourceName,
            ActivityStopped = a => { lock (stopped) stopped.Add(a.SpanId.ToHexString()); },
            Sample = (ref System.Diagnostics.ActivityCreationOptions<System.Diagnostics.ActivityContext> _) =>
                System.Diagnostics.ActivitySamplingResult.AllData,
        };
        System.Diagnostics.ActivitySource.AddActivityListener(listener);

        var type = NewEventType();
        var transport = Transport();
        string[] traceparents =
        [
            "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
            "00-1af7651916cd43dd8448eb211c80319c-c7ad6b7169203331-01",
            "not-a-traceparent",
        ];
        foreach (var (tp, n) in traceparents.Select((t, i) => (t, i)))
            await transport.PublishAsync(Envelope(type, $"m{n}") with { Traceparent = tp });

        System.Diagnostics.Activity? seen = null;
        await transport.SubscribeBatchAsync<string>(type, (_, _) =>
        {
            seen = System.Diagnostics.Activity.Current;
            return Task.FromResult<IReadOnlyCollection<Guid>>([]);
        });

        await Eventually(() => seen is not null);
        Assert.NotNull(seen);
        Assert.Equal(System.Diagnostics.ActivityKind.Consumer, seen!.Kind);
        Assert.Null(seen.ParentId);
        Assert.Equal(2, seen.Links.Count());   // the malformed one is ignored, not an error
        Assert.Contains(seen.Links, l => l.Context.TraceId.ToHexString() == "0af7651916cd43dd8448eb211c80319c");
        Assert.Contains(seen.Links, l => l.Context.TraceId.ToHexString() == "1af7651916cd43dd8448eb211c80319c");
        Assert.Contains(seen.TagObjects, t => t.Key == "messaging.batch.message_count" && (int)t.Value! == 3);
        await Eventually(() => { lock (stopped) return stopped.Contains(seen.SpanId.ToHexString()); });
        await Task.Delay(300);
        lock (stopped) Assert.Equal(1, stopped.Count(id => id == seen.SpanId.ToHexString()));   // the span ends, and is exported, once
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
