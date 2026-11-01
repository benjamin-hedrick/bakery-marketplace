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

    public async Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        if (handler is null) throw new ArgumentNullException(nameof(handler));

        string streamKey = GetStreamKey(eventType);
        // One group per service and event type (register item 29): two services subscribing to the same event each receive every message,
        // while instances of one service share the group and split the work. Without a service name the old per-event-type name is kept.
        string groupName = string.IsNullOrWhiteSpace(_serviceName) ? $"cg:{eventType}" : $"cg:{_serviceName}:{eventType}";
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
                            foreach (var entry in claimed)
                            {
                                if (entry.IsNull) continue;
                                worked = true;
                                await ProcessAsync(entry, deliveries.GetValueOrDefault((string)entry.Id!, 2), streamKey, groupName, handler, cts.Token);
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

                    foreach (var entry in entries)
                    {
                        await ProcessAsync(entry, 1, streamKey, groupName, handler, cts.Token);
                    }
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
            if (deliveryCount >= _maxDeliveryAttempts)
            {
                string deadLetterKey = $"{streamKey}:dead-letter";
                await _database.StreamAddAsync(deadLetterKey, new NameValueEntry[]
                {
                    new("envelope", (string)jsonValue!),
                    new("failedAt", DateTimeOffset.UtcNow.ToString("O")),
                    new("attempts", deliveryCount.ToString())
                });

                await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
            }
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
