namespace BakeryMarketplace.Eventing;

/// <summary>
/// Adapter interface for event subscription.
/// Consumers must be idempotent on EventId — the transport guarantees at-least-once delivery,
/// not exactly-once (see ADR-0003).
/// <para>
/// <c>consumerName</c> (WI-ORD-003, register item 29): a consumer inside a service that must receive every message of an event type
/// even though another consumer in the same service also subscribes to it. Without a name the consumer is the service's default
/// consumer (instances of the service share it and split the work). With a name it is a separate consumer: it gets every message, and
/// its instances split the work among themselves. Subscribing the same event type twice with the same name in one process throws
/// <see cref="InvalidOperationException"/> at subscription time, because the two would silently split the messages.
/// </para>
/// </summary>
public interface IEventSubscriber
{
    Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        string? consumerName = null,
        CancellationToken ct = default);

    /// <summary>
    /// Subscribes with a handler that receives the events the transport collected together (for Redis Streams, one poll of
    /// up to 10 entries of one event type), so it can do one batched read or write for all of them. The handler returns the
    /// <c>EventId</c>s that failed (an empty collection when all succeeded); those stay pending for redelivery and are dead-lettered
    /// after the maximum attempts, exactly as for <see cref="SubscribeAsync{T}"/>, and the rest are acknowledged. If the handler throws,
    /// every event in the batch counts as failed. Batches of one are normal. Handlers must still be idempotent on <c>EventId</c>.
    /// </summary>
    Task SubscribeBatchAsync<T>(
        string eventType,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler,
        string? consumerName = null,
        CancellationToken ct = default);
}
