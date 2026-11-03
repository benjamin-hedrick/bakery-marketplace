namespace BakeryMarketplace.Eventing;

/// <summary>
/// Adapter interface for event subscription.
/// Consumers must be idempotent on EventId — the transport guarantees at-least-once delivery,
/// not exactly-once (see ADR-0003).
/// </summary>
public interface IEventSubscriber
{
    Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
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
        CancellationToken ct = default);
}
