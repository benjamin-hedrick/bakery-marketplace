namespace BakeryMarketplace.Eventing;

/// <summary>
/// Adapter interface for all event transport backends (Azure Event Grid, Redis Streams, etc.).
/// See ADR-0003 for the event-driven backbone design.
/// </summary>
public interface IEventPublisher
{
    Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default);
}
