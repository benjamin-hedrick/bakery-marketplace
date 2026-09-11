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
}
