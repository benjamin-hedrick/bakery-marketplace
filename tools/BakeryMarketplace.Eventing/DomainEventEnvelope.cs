namespace BakeryMarketplace.Eventing;

/// <summary>
/// Standard event envelope published by all domain event producers.
/// Field names match ADR-0003's design exactly — do not rename.
/// <c>Traceparent</c> (ADR-0016) is the W3C trace context of the publisher; it is optional so that older messages still deserialize.
/// </summary>
/// <typeparam name="T">The domain event payload type.</typeparam>
public record DomainEventEnvelope<T>(
    Guid EventId,
    string EventType,
    int SchemaVersion,
    DateTimeOffset OccurredAt,
    string AggregateType,
    string AggregateId,
    long SequenceNumber,
    T Payload,
    string? Traceparent = null
);
