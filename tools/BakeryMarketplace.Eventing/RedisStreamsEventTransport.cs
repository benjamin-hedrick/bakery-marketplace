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
    private readonly ConcurrentBag<CancellationTokenSource> _ctsList = new();

    public RedisStreamsEventTransport(
        IConnectionMultiplexer multiplexer,
        int db = -1,
        int maxDeliveryAttempts = 3)
    {
        if (multiplexer is null) throw new ArgumentNullException(nameof(multiplexer));
        _database = multiplexer.GetDatabase(db);
        _maxDeliveryAttempts = maxDeliveryAttempts;
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    public RedisStreamsEventTransport(
        IDatabase database,
        int maxDeliveryAttempts = 3)
    {
        _database = database ?? throw new ArgumentNullException(nameof(database));
        _maxDeliveryAttempts = maxDeliveryAttempts;
        _jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
    }

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        if (envelope is null) throw new ArgumentNullException(nameof(envelope));

        string streamKey = GetStreamKey(envelope.EventType);
        string serialized = JsonSerializer.Serialize(envelope, _jsonOptions);

        var entries = new NameValueEntry[]
        {
            new("envelope", serialized),
            new("eventId", envelope.EventId.ToString()),
            new("eventType", envelope.EventType)
        };

        await _database.StreamAddAsync(streamKey, entries);
    }

    public async Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventType)) throw new ArgumentException("EventType cannot be empty.", nameof(eventType));
        if (handler is null) throw new ArgumentNullException(nameof(handler));

        string streamKey = GetStreamKey(eventType);
        string groupName = $"cg:{eventType}";
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
            var attempts = new ConcurrentDictionary<string, int>();

            while (!cts.Token.IsCancellationRequested)
            {
                try
                {
                    StreamEntry[] entries = await _database.StreamReadGroupAsync(
                        streamKey,
                        groupName,
                        consumerName,
                        StreamPosition.NewMessages,
                        count: 10);

                    if (entries == null || entries.Length == 0)
                    {
                        await Task.Delay(50, cts.Token);
                        continue;
                    }

                    foreach (var entry in entries)
                    {
                        var jsonValue = entry.Values.FirstOrDefault(v => v.Name == "envelope").Value;
                        if (jsonValue.IsNull) continue;

                        DomainEventEnvelope<T>? envelope = null;
                        try
                        {
                            envelope = JsonSerializer.Deserialize<DomainEventEnvelope<T>>((string)jsonValue!, _jsonOptions);
                        }
                        catch { }

                        if (envelope == null)
                        {
                            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
                            continue;
                        }

                        int currentAttempt = attempts.AddOrUpdate(entry.Id.ToString(), 1, (_, count) => count + 1);

                        try
                        {
                            await handler(envelope, cts.Token);
                            await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
                            attempts.TryRemove(entry.Id.ToString(), out _);
                        }
                        catch
                        {
                            if (currentAttempt >= _maxDeliveryAttempts)
                            {
                                string deadLetterKey = $"{streamKey}:dead-letter";
                                await _database.StreamAddAsync(deadLetterKey, new NameValueEntry[]
                                {
                                    new("envelope", (string)jsonValue!),
                                    new("failedAt", DateTimeOffset.UtcNow.ToString("O")),
                                    new("attempts", currentAttempt.ToString())
                                });

                                await _database.StreamAcknowledgeAsync(streamKey, groupName, entry.Id);
                                attempts.TryRemove(entry.Id.ToString(), out _);
                            }
                        }
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
