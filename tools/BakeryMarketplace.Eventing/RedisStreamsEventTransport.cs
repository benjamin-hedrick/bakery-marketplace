using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// Redis Streams implementation of <see cref="IEventPublisher"/> and <see cref="IEventSubscriber"/>.
/// Uses XADD for publishing and consumer groups (XREADGROUP) for subscriptions, with a dead-letter stream on max retries.
/// See ADR-0003 and WI-EVT-003.
/// </summary>
public sealed partial class RedisStreamsEventTransport : IEventPublisher, IEventSubscriber, IDisposable
{
    private readonly IDatabase _database;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly int _maxDeliveryAttempts;
    private readonly int? _maxStreamLength;
    private readonly string? _serviceName;
    private readonly TimeSpan _redeliverAfter;
    private readonly ILogger _logger;
    private readonly ConcurrentBag<CancellationTokenSource> _ctsList = new();
    private readonly ConcurrentDictionary<string, byte> _namedGroups = new();
    private long _lastPollErrorLogged;

    public RedisStreamsEventTransport(
        IConnectionMultiplexer multiplexer,
        int db = -1,
        int maxDeliveryAttempts = 10,
        int? maxStreamLength = null,
        string? serviceName = null,
        TimeSpan? redeliverAfter = null,
        ILogger? logger = null)
        : this(DatabaseOf(multiplexer, db), maxDeliveryAttempts, maxStreamLength, serviceName, redeliverAfter, logger)
    {
    }

    /// <param name="logger">Where failures are reported: a poll that failed, a handler that threw, an entry that could not be read. Null logs nothing.</param>
    public RedisStreamsEventTransport(
        IDatabase database,
        int maxDeliveryAttempts = 10,
        int? maxStreamLength = null,
        string? serviceName = null,
        TimeSpan? redeliverAfter = null,
        ILogger? logger = null)
    {
        _database = database ?? throw new ArgumentNullException(nameof(database));
        _maxDeliveryAttempts = maxDeliveryAttempts;
        _maxStreamLength = ValidateMaxStreamLength(maxStreamLength);
        _serviceName = serviceName;
        _redeliverAfter = redeliverAfter ?? DefaultRedeliverAfter;
        _logger = logger ?? NullLogger.Instance;
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    private static IDatabase DatabaseOf(IConnectionMultiplexer multiplexer, int db)
    {
        ArgumentNullException.ThrowIfNull(multiplexer);
        return multiplexer.GetDatabase(db);
    }

    /// <summary>How long a delivered message may stay unacknowledged before it is handed to a consumer again.</summary>
    public static readonly TimeSpan DefaultRedeliverAfter = TimeSpan.FromSeconds(30);

    /// <summary>
    /// How long a message that has been delivered <paramref name="deliveries"/> times waits before the next delivery: the redeliver time doubled once, for
    /// any earlier failure, so 30 s then 60 s by default (register item 183). A handler outage that lasts a few minutes is outlasted instead of dead-lettered.
    /// </summary>
    internal TimeSpan RedeliveryDelay(long deliveries) =>
        _redeliverAfter * Math.Pow(2, Math.Clamp(deliveries - 1, 0, 1));

    private static int? ValidateMaxStreamLength(int? value) =>
        value is null or > 0 ? value : throw new ArgumentOutOfRangeException(nameof(value), "The stream length limit must be positive, or null for no limit.");

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        envelope = EventTracing.StampTraceparent(envelope);

        string streamKey = GetStreamKey(envelope.EventType);
        string serialized = JsonSerializer.Serialize(envelope, _jsonOptions);

        var entries = new NameValueEntry[]
        {
            new("envelope", serialized),
            new("eventId", envelope.EventId.ToString()),
            new("eventType", envelope.EventType)
        };

        // With a limit, Redis trims the oldest entries (approximately: whole internal blocks, so it is cheap). Trimming removes entries
        // even if a consumer group has not read them yet, so the limit must be far above the backlog a consumer could fall behind by.
        try
        {
            await _database.StreamAddAsync(streamKey, entries, maxLength: _maxStreamLength, useApproximateMaxLength: _maxStreamLength is not null);
        }
        catch (Exception ex) when (ex is RedisConnectionException or RedisTimeoutException or TimeoutException)
        {
            // The broker is unreachable or slow: a failure retrying may fix, told apart from one it cannot (register item 182).
            throw new EventTransportException($"The event broker could not be reached to publish to {streamKey}: {ex.Message}", ex);
        }
    }

    public Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        string? consumerName = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        ArgumentNullException.ThrowIfNull(handler);

        string streamKey = GetStreamKey(eventType);
        string groupName = ClaimGroupName(eventType, consumerName);
        return RunSubscriptionAsync(eventType, groupName, async (deliveries, token) =>
        {
            foreach (var (entry, count) in deliveries)
                await ProcessAsync(entry, count, streamKey, groupName, consumerName, handler, token);
        }, ct);
    }

    public Task SubscribeBatchAsync<T>(
        string eventType,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler,
        string? consumerName = null,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        ArgumentNullException.ThrowIfNull(handler);

        string streamKey = GetStreamKey(eventType);
        string groupName = ClaimGroupName(eventType, consumerName);
        return RunSubscriptionAsync(eventType, groupName,
            (deliveries, token) => ProcessBatchAsync(deliveries, streamKey, groupName, consumerName, handler, token), ct);
    }

    // One group per service and event type (register item 29): two services subscribing to the same event each receive every message,
    // while instances of one service share the group and split the work. Without a service name the old per-event-type name is kept.
    // A consumer name (WI-ORD-003) gives a second consumer inside one service a group of its own, so it also receives every message.
    private string GroupName(string eventType, string? consumerName)
    {
        var owner = string.IsNullOrWhiteSpace(_serviceName) ? "" : $"{_serviceName}:";
        var consumer = string.IsNullOrWhiteSpace(consumerName) ? "" : $"{consumerName}:";
        return $"cg:{owner}{consumer}{eventType}";
    }

    // A named group may be used once per transport instance: a second subscription with the same name would join the same group
    // and the two handlers would each miss the messages the other took, with no error. Default groups are not checked, because
    // instances of one service are meant to share them (and existing callers may subscribe a default group more than once).
    private string ClaimGroupName(string eventType, string? consumerName)
    {
        var group = GroupName(eventType, consumerName);
        if (!string.IsNullOrWhiteSpace(consumerName) && !_namedGroups.TryAdd(group, 0))
            throw new InvalidOperationException($"Consumer '{consumerName}' already subscribes to '{eventType}'; two subscriptions with one name would split the messages.");
        return group;
    }

    private async Task RunSubscriptionAsync(
        string eventType,
        string groupName,
        Func<IReadOnlyList<(StreamEntry Entry, long DeliveryCount)>, CancellationToken, Task> processBatch,
        CancellationToken ct)
    {
        string streamKey = GetStreamKey(eventType);
        string consumerName = $"consumer:{Guid.NewGuid():N}";

        try
        {
            await _database.StreamCreateConsumerGroupAsync(streamKey, groupName, "0-0", createStream: true);
        }
        catch (RedisServerException ex) when (ex.Message.Contains("BUSYGROUP"))
        {
            // Group already exists
        }

        var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _ctsList.Add(cts);

        _ = Task.Run(async () =>
        {
            var lastReclaim = DateTimeOffset.MinValue;

            while (!cts.Token.IsCancellationRequested)
            {
                try
                {
                    var worked = false;

                    // Messages that were delivered and never acknowledged (the handler threw, or the consumer died) are handed out again once
                    // they have been idle long enough, and dead-lettered after the maximum number of deliveries (register item 112).
                    if (DateTimeOffset.UtcNow - lastReclaim >= TimeSpan.FromMilliseconds(Math.Max(50, _redeliverAfter.TotalMilliseconds / 4)))
                    {
                        lastReclaim = DateTimeOffset.UtcNow;
                        var pending = (await _database.StreamPendingMessagesAsync(streamKey, groupName, 10, RedisValue.Null))
                            .Where(p => p.IdleTimeInMilliseconds >= RedeliveryDelay(p.DeliveryCount).TotalMilliseconds).ToArray();
                        if (pending.Length > 0)
                        {
                            var claimed = await _database.StreamClaimAsync(
                                streamKey, groupName, consumerName, (long)_redeliverAfter.TotalMilliseconds,
                                pending.Select(p => p.MessageId).ToArray());
                            var deliveries = pending.ToDictionary(p => (string)p.MessageId!, p => p.DeliveryCount + 1);
                            var again = claimed.Where(e => !e.IsNull)
                                .Select(e => (e, (long)deliveries.GetValueOrDefault((string)e.Id!, 2))).ToList();
                            if (again.Count > 0)
                            {
                                worked = true;
                                await processBatch(again, cts.Token);
                            }
                        }
                    }

                    StreamEntry[] entries = await _database.StreamReadGroupAsync(
                        streamKey,
                        groupName,
                        consumerName,
                        StreamPosition.NewMessages,
                        count: 10);

                    if (entries == null || entries.Length == 0)
                    {
                        if (!worked) await Task.Delay(50, cts.Token);
                        continue;
                    }

                    await processBatch(entries.Select(e => (e, 1L)).ToList(), cts.Token);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // A broker that is down fails every poll: report the first failure and then at most one in thirty seconds.
                    var now = Environment.TickCount64;
                    if (now - Interlocked.Read(ref _lastPollErrorLogged) >= 30_000 || _lastPollErrorLogged == 0)
                    {
                        Interlocked.Exchange(ref _lastPollErrorLogged, now);
                        LogPollFailed(_logger, ex, streamKey);
                    }
                    await Task.Delay(100, cts.Token);
                }
            }
        }, cts.Token);
    }

    /// <summary>
    /// Runs the handler for one delivery. A success acknowledges the message. A failure leaves it pending, to be handed out again after
    /// <c>redeliverAfter</c>; at <paramref name="deliveryCount"/> equal to the maximum it is copied to the dead-letter stream and acknowledged.
    /// </summary>
    private async Task ProcessAsync<T>(
        StreamEntry entry, long deliveryCount, string streamKey, string groupName, string? consumerName,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler, CancellationToken token)
    {
        var jsonValue = entry.Values.FirstOrDefault(v => v.Name == "envelope").Value;
        if (jsonValue.IsNull)
        {
            await DeadLetterUnreadableAsync(entry, null, "the entry has no envelope field", streamKey, groupName, consumerName);
            return;
        }

        DomainEventEnvelope<T>? envelope;
        try
        {
            envelope = JsonSerializer.Deserialize<DomainEventEnvelope<T>>((string)jsonValue!, _jsonOptions);
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            await DeadLetterUnreadableAsync(entry, (string)jsonValue!, $"the envelope could not be read: {ex.GetType().Name}", streamKey, groupName, consumerName);
            return;
        }

        if (envelope == null)
        {
            await DeadLetterUnreadableAsync(entry, (string)jsonValue!, "the envelope is empty", streamKey, groupName, consumerName);
            return;
        }

        try
        {
            using var consumer = EventTracing.StartConsumer(envelope);
            await handler(envelope, token);
            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            LogHandlerFailed(_logger, ex, streamKey, entry.Id.ToString(), deliveryCount, _maxDeliveryAttempts);
            await FailAsync(entry, deliveryCount, (string)jsonValue!, streamKey, groupName, consumerName);
        }
    }

    /// <summary>
    /// An entry that cannot be turned into an envelope can never be handled, so retrying is pointless. It is copied, as it is, to the
    /// dead-letter stream with the reason, reported, and acknowledged: nothing is dropped without a trace.
    /// </summary>
    private async Task DeadLetterUnreadableAsync(
        StreamEntry entry, string? envelopeJson, string reason, string streamKey, string groupName, string? consumerName)
    {
        var fields = new List<NameValueEntry>
        {
            new("envelope", envelopeJson ?? ""),
            new("failedAt", DateTimeOffset.UtcNow.ToString("O")),
            new("attempts", "1"),
            new("reason", reason),
        };
        if (!string.IsNullOrWhiteSpace(consumerName)) fields.Add(new("consumer", consumerName));
        await _database.StreamAddAsync($"{streamKey}:dead-letter", fields.ToArray());
        await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
        LogUnreadable(_logger, streamKey, entry.Id.ToString(), reason);
    }

    /// <summary>A failed delivery stays pending; at the maximum number of deliveries it is copied to the dead-letter stream and acknowledged.</summary>
    private async Task FailAsync(StreamEntry entry, long deliveryCount, string envelopeJson, string streamKey, string groupName, string? consumerName)
    {
        if (deliveryCount >= _maxDeliveryAttempts)
        {
            string deadLetterKey = $"{streamKey}:dead-letter";
            var fields = new List<NameValueEntry>
            {
                new("envelope", envelopeJson),
                new("failedAt", DateTimeOffset.UtcNow.ToString("O")),
                new("attempts", deliveryCount.ToString(System.Globalization.CultureInfo.InvariantCulture))
            };
            // The stream is per event type; the consumer field says which consumer gave up (absent for the default consumer).
            if (!string.IsNullOrWhiteSpace(consumerName)) fields.Add(new("consumer", consumerName));
            await _database.StreamAddAsync(deadLetterKey, fields.ToArray());

            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
            LogDeadLettered(_logger, streamKey, entry.Id.ToString(), deliveryCount);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Event stream {Stream}: reading failed; retrying (further failures are not logged for 30 seconds)")]
    private static partial void LogPollFailed(ILogger logger, Exception exception, string stream);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A handler failed on {Stream} entry {EntryId} (delivery {Delivery} of {Max}); it stays pending and is delivered again")]
    private static partial void LogHandlerFailed(ILogger logger, Exception exception, string stream, string entryId, long delivery, int max);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A batch handler failed on {Stream} for {Count} events; each stays pending and is delivered again")]
    private static partial void LogBatchHandlerFailed(ILogger logger, Exception exception, string stream, int count);

    [LoggerMessage(Level = LogLevel.Error, Message = "{Stream} entry {EntryId} failed {Attempts} deliveries and was moved to the dead-letter stream")]
    private static partial void LogDeadLettered(ILogger logger, string stream, string entryId, long attempts);

    [LoggerMessage(Level = LogLevel.Error, Message = "{Stream} entry {EntryId} cannot be read ({Reason}) and was moved to the dead-letter stream")]
    private static partial void LogUnreadable(ILogger logger, string stream, string entryId, string reason);

    /// <summary>
    /// Runs the batch handler once for the entries of one poll. Entries whose event id the handler returns (or all of them, if it
    /// throws) are treated as failed and follow the same retry and dead-letter path as <see cref="ProcessAsync{T}"/>; the rest are
    /// acknowledged one by one. One consumer activity covers the batch, linked to each event's publisher trace (a batch has no single parent).
    /// </summary>
    private async Task ProcessBatchAsync<T>(
        IReadOnlyList<(StreamEntry Entry, long DeliveryCount)> deliveries, string streamKey, string groupName, string? consumerName,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler, CancellationToken token)
    {
        var parsed = new List<(StreamEntry Entry, long DeliveryCount, string Json, DomainEventEnvelope<T> Envelope)>();
        foreach (var (entry, count) in deliveries)
        {
            var jsonValue = entry.Values.FirstOrDefault(v => v.Name == "envelope").Value;
            DomainEventEnvelope<T>? envelope = null;
            var reason = "the entry has no envelope field";
            if (!jsonValue.IsNull)
            {
                reason = "the envelope is empty";
                try
                {
                    envelope = JsonSerializer.Deserialize<DomainEventEnvelope<T>>((string)jsonValue!, _jsonOptions);
                }
                catch (Exception ex) when (ex is JsonException or NotSupportedException)
                {
                    reason = $"the envelope could not be read: {ex.GetType().Name}";
                }
            }

            if (envelope == null) await DeadLetterUnreadableAsync(entry, jsonValue.IsNull ? null : (string)jsonValue!, reason, streamKey, groupName, consumerName); // unreadable: nothing to retry
            else parsed.Add((entry, count, (string)jsonValue!, envelope));
        }
        if (parsed.Count == 0) return;

        IReadOnlyCollection<Guid> failedIds;
        try
        {
            var envelopes = parsed.Select(p => p.Envelope).ToList();
            using var consumer = EventTracing.StartBatchConsumer(parsed[0].Envelope.EventType, envelopes);
            failedIds = await handler(envelopes, token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            LogBatchHandlerFailed(_logger, ex, streamKey, parsed.Count);
            failedIds = parsed.Select(p => p.Envelope.EventId).ToList();
        }

        var failed = new HashSet<Guid>(failedIds);
        foreach (var p in parsed)
        {
            if (failed.Contains(p.Envelope.EventId)) await FailAsync(p.Entry, p.DeliveryCount, p.Json, streamKey, groupName, consumerName);
            else await _database.StreamAcknowledgeAsync(streamKey, groupName, p.Entry.Id);
        }
    }

    private static string GetStreamKey(string eventType) => $"events:{eventType}";

    public void Dispose()
    {
        GC.SuppressFinalize(this);
        // Safe to call twice: the host's container disposes the transport at shutdown, and a test or caller may have done so already.
        while (_ctsList.TryTake(out var cts))
        {
            cts.Cancel();
            cts.Dispose();
        }
    }
}
