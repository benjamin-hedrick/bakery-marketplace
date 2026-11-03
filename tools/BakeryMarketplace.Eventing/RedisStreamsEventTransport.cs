using System.Collections.Concurrent;
using System.Text.Json;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// Redis Streams implementation of <see cref="IEventPublisher"/> and <see cref="IEventSubscriber"/>.
/// Uses XADD for publishing and consumer groups (XREADGROUP) for subscriptions, with a dead-letter stream on max retries.
/// See ADR-0003 and WI-EVT-003.
/// </summary>
public class RedisStreamsEventTransport : IEventPublisher, IEventSubscriber, IDisposable
{
    private readonly IDatabase _database;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly int _maxDeliveryAttempts;
    private readonly int? _maxStreamLength;
    private readonly string? _serviceName;
    private readonly TimeSpan _redeliverAfter;
    private readonly ConcurrentBag<CancellationTokenSource> _ctsList = new();

    public RedisStreamsEventTransport(
        IConnectionMultiplexer multiplexer,
        int db = -1,
        int maxDeliveryAttempts = 3,
        int? maxStreamLength = null,
        string? serviceName = null,
        TimeSpan? redeliverAfter = null)
    {
        if (multiplexer is null) throw new ArgumentNullException(nameof(multiplexer));
        _database = multiplexer.GetDatabase(db);
        _maxDeliveryAttempts = maxDeliveryAttempts;
        _maxStreamLength = ValidateMaxStreamLength(maxStreamLength);
        _serviceName = serviceName;
        _redeliverAfter = redeliverAfter ?? DefaultRedeliverAfter;
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    public RedisStreamsEventTransport(
        IDatabase database,
        int maxDeliveryAttempts = 3,
        int? maxStreamLength = null,
        string? serviceName = null,
        TimeSpan? redeliverAfter = null)
    {
        _database = database ?? throw new ArgumentNullException(nameof(database));
        _maxDeliveryAttempts = maxDeliveryAttempts;
        _maxStreamLength = ValidateMaxStreamLength(maxStreamLength);
        _serviceName = serviceName;
        _redeliverAfter = redeliverAfter ?? DefaultRedeliverAfter;
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    /// <summary>How long a delivered message may stay unacknowledged before it is handed to a consumer again.</summary>
    public static readonly TimeSpan DefaultRedeliverAfter = TimeSpan.FromSeconds(30);

    private static int? ValidateMaxStreamLength(int? value) =>
        value is null or > 0 ? value : throw new ArgumentOutOfRangeException(nameof(value), "The stream length limit must be positive, or null for no limit.");

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        if (envelope is null) throw new ArgumentNullException(nameof(envelope));
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
        await _database.StreamAddAsync(streamKey, entries, maxLength: _maxStreamLength, useApproximateMaxLength: _maxStreamLength is not null);
    }

    public Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        if (handler is null) throw new ArgumentNullException(nameof(handler));

        string streamKey = GetStreamKey(eventType);
        string groupName = GroupName(eventType);
        return RunSubscriptionAsync(eventType, async (deliveries, token) =>
        {
            foreach (var (entry, count) in deliveries)
                await ProcessAsync(entry, count, streamKey, groupName, handler, token);
        }, ct);
    }

    public Task SubscribeBatchAsync<T>(
        string eventType,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        if (handler is null) throw new ArgumentNullException(nameof(handler));

        string streamKey = GetStreamKey(eventType);
        string groupName = GroupName(eventType);
        return RunSubscriptionAsync(eventType,
            (deliveries, token) => ProcessBatchAsync(deliveries, streamKey, groupName, handler, token), ct);
    }

    // One group per service and event type (register item 29): two services subscribing to the same event each receive every message,
    // while instances of one service share the group and split the work. Without a service name the old per-event-type name is kept.
    private string GroupName(string eventType) =>
        string.IsNullOrWhiteSpace(_serviceName) ? $"cg:{eventType}" : $"cg:{_serviceName}:{eventType}";

    private async Task RunSubscriptionAsync(
        string eventType,
        Func<IReadOnlyList<(StreamEntry Entry, long DeliveryCount)>, CancellationToken, Task> processBatch,
        CancellationToken ct)
    {
        string streamKey = GetStreamKey(eventType);
        string groupName = GroupName(eventType);
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
                            .Where(p => p.IdleTimeInMilliseconds >= _redeliverAfter.TotalMilliseconds).ToArray();
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
                catch
                {
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
        StreamEntry entry, long deliveryCount, string streamKey, string groupName,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler, CancellationToken token)
    {
        var jsonValue = entry.Values.FirstOrDefault(v => v.Name == "envelope").Value;
        if (jsonValue.IsNull)
        {
            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
            return;
        }

        DomainEventEnvelope<T>? envelope = null;
        try
        {
            envelope = JsonSerializer.Deserialize<DomainEventEnvelope<T>>((string)jsonValue!, _jsonOptions);
        }
        catch { }

        if (envelope == null)
        {
            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
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
        catch
        {
            await FailAsync(entry, deliveryCount, (string)jsonValue!, streamKey, groupName);
        }
    }

    /// <summary>A failed delivery stays pending; at the maximum number of deliveries it is copied to the dead-letter stream and acknowledged.</summary>
    private async Task FailAsync(StreamEntry entry, long deliveryCount, string envelopeJson, string streamKey, string groupName)
    {
        if (deliveryCount >= _maxDeliveryAttempts)
        {
            string deadLetterKey = $"{streamKey}:dead-letter";
            await _database.StreamAddAsync(deadLetterKey, new NameValueEntry[]
            {
                new("envelope", envelopeJson),
                new("failedAt", DateTimeOffset.UtcNow.ToString("O")),
                new("attempts", deliveryCount.ToString())
            });

            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
        }
    }

    /// <summary>
    /// Runs the batch handler once for the entries of one poll. Entries whose event id the handler returns (or all of them, if it
    /// throws) are treated as failed and follow the same retry and dead-letter path as <see cref="ProcessAsync{T}"/>; the rest are
    /// acknowledged one by one. No per-event trace scope is started: a batch has no single parent trace.
    /// </summary>
    private async Task ProcessBatchAsync<T>(
        IReadOnlyList<(StreamEntry Entry, long DeliveryCount)> deliveries, string streamKey, string groupName,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler, CancellationToken token)
    {
        var parsed = new List<(StreamEntry Entry, long DeliveryCount, string Json, DomainEventEnvelope<T> Envelope)>();
        foreach (var (entry, count) in deliveries)
        {
            var jsonValue = entry.Values.FirstOrDefault(v => v.Name == "envelope").Value;
            DomainEventEnvelope<T>? envelope = null;
            if (!jsonValue.IsNull)
            {
                try { envelope = JsonSerializer.Deserialize<DomainEventEnvelope<T>>((string)jsonValue!, _jsonOptions); }
                catch { }
            }

            if (envelope == null) await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id); // unreadable: nothing to retry
            else parsed.Add((entry, count, (string)jsonValue!, envelope));
        }
        if (parsed.Count == 0) return;

        IReadOnlyCollection<Guid> failedIds;
        try
        {
            failedIds = await handler(parsed.Select(p => p.Envelope).ToList(), token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch
        {
            failedIds = parsed.Select(p => p.Envelope.EventId).ToList();
        }

        var failed = new HashSet<Guid>(failedIds);
        foreach (var p in parsed)
        {
            if (failed.Contains(p.Envelope.EventId)) await FailAsync(p.Entry, p.DeliveryCount, p.Json, streamKey, groupName);
            else await _database.StreamAcknowledgeAsync(streamKey, groupName, p.Entry.Id);
        }
    }

    private static string GetStreamKey(string eventType) => $"events:{eventType}";

    public void Dispose()
    {
        foreach (var cts in _ctsList)
        {
            cts.Cancel();
            cts.Dispose();
        }
    }
}
