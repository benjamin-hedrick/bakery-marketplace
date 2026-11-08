using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Nothing is dropped or failed without a trace: an entry that cannot be read goes to the dead-letter stream with the reason, and a handler
/// that throws is reported. Real Redis only (set REDIS_CONNECTION_STRING).
/// </summary>
public sealed class RedisFailureReportingTests : IDisposable
{
    private static readonly TimeSpan Quick = TimeSpan.FromMilliseconds(200);

    private readonly Lazy<ConnectionMultiplexer> _redis = new(() => ConnectionMultiplexer.Connect(RedisFactAttribute.ConnectionString!));
    private readonly List<string> _keys = [];
    private readonly CapturingLogger _log = new();

    public void Dispose()
    {
        if (!_redis.IsValueCreated) return;
        foreach (var key in _keys) _redis.Value.GetDatabase().KeyDelete(key);
        _redis.Value.Dispose();
    }

    private string NewEventType()
    {
        var type = $"FailureTest{Guid.NewGuid():N}";
        _keys.Add($"events:{type}");
        _keys.Add($"events:{type}:dead-letter");
        return type;
    }

    private RedisStreamsEventTransport Transport(int attempts = 3) =>
        new(_redis.Value, maxDeliveryAttempts: attempts, redeliverAfter: Quick, logger: _log);

    private static async Task Eventually(Func<bool> condition, int seconds = 10)
    {
        var until = DateTime.UtcNow.AddSeconds(seconds);
        while (!condition() && DateTime.UtcNow < until) await Task.Delay(50);
    }

    private IDatabase Db => _redis.Value.GetDatabase();

    [RedisFact]
    public async Task AnEnvelopeThatIsNotJsonIsDeadLetteredWithTheReasonAndReported()
    {
        var type = NewEventType();
        var handled = 0;
        await Transport().SubscribeAsync<string>(type, (_, _) =>
        {
            Interlocked.Increment(ref handled);
            return Task.CompletedTask;
        });

        await Db.StreamAddAsync($"events:{type}", [new NameValueEntry("envelope", "{ this is not an envelope")]);
        await Eventually(() => Db.StreamLength($"events:{type}:dead-letter") == 1);

        var dead = Db.StreamRange($"events:{type}:dead-letter").Single();
        Assert.Equal("{ this is not an envelope", dead.Values.First(v => v.Name == "envelope").Value);
        Assert.Contains("could not be read", (string)dead.Values.First(v => v.Name == "reason").Value!);
        Assert.Equal(0, handled);
        Assert.Equal(0, Db.StreamPending($"events:{type}", $"cg:{type}").PendingMessageCount);
        Assert.Contains(_log.Entries, e => e.Level == LogLevel.Error && e.Message.Contains("cannot be read"));
    }

    [RedisFact]
    public async Task AnEntryWithoutAnEnvelopeFieldIsDeadLettered()
    {
        var type = NewEventType();
        await Transport().SubscribeAsync<string>(type, (_, _) => Task.CompletedTask);

        await Db.StreamAddAsync($"events:{type}", [new NameValueEntry("other", "x")]);
        await Eventually(() => Db.StreamLength($"events:{type}:dead-letter") == 1);

        var dead = Db.StreamRange($"events:{type}:dead-letter").Single();
        Assert.Contains("no envelope field", (string)dead.Values.First(v => v.Name == "reason").Value!);
    }

    [RedisFact]
    public async Task AnUnreadableEntryInABatchIsDeadLetteredAndTheReadableOnesAreStillDelivered()
    {
        var type = NewEventType();
        var seen = new List<string>();
        await Transport().SubscribeBatchAsync<string>(type, (events, _) =>
        {
            lock (seen) seen.AddRange(events.Select(e => e.Payload));
            return Task.FromResult<IReadOnlyCollection<Guid>>([]);
        });

        await Db.StreamAddAsync($"events:{type}", [new NameValueEntry("envelope", "garbage")]);
        await Transport().PublishAsync(new DomainEventEnvelope<string>(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", 1, "good"));
        await Eventually(() => Db.StreamLength($"events:{type}:dead-letter") == 1 && Count(seen) == 1);

        Assert.Equal(["good"], seen);
        Assert.Equal(1, Db.StreamLength($"events:{type}:dead-letter"));
    }

    [RedisFact]
    public async Task AHandlerThatThrowsIsReportedAndTheEntryIsDeadLetteredAtTheLimit()
    {
        var type = NewEventType();
        await Transport(attempts: 2).SubscribeAsync<string>(type, (_, _) => throw new InvalidOperationException("boom"));

        await Transport().PublishAsync(new DomainEventEnvelope<string>(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", 1, "p"));
        await Eventually(() => Db.StreamLength($"events:{type}:dead-letter") == 1);

        Assert.Contains(_log.Entries, e => e.Level == LogLevel.Warning && e.Message.Contains("handler failed") && e.Exception is InvalidOperationException);
        Assert.Contains(_log.Entries, e => e.Level == LogLevel.Error && e.Message.Contains("dead-letter"));
    }

    private static int Count(List<string> list)
    {
        lock (list) return list.Count;
    }

    private sealed class CapturingLogger : ILogger
    {
        private readonly List<(LogLevel Level, string Message, Exception? Exception)> _entries = [];

        public IReadOnlyList<(LogLevel Level, string Message, Exception? Exception)> Entries
        {
            get
            {
                lock (_entries) return _entries.ToList();
            }
        }

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            lock (_entries) _entries.Add((logLevel, formatter(state, exception), exception));
        }
    }
}
