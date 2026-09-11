```
WI ID:               EVT-001
Title:                Define IEventPublisher/IEventSubscriber interfaces + envelope + contract tests
Type:                 Interface/Contract
Epic:                 EPIC-EVENTING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
ADR-0003 establishes the event-driven backbone design: Azure Event Grid (cloud) / Redis Streams (local), at-least-once delivery, per-aggregate sequencing, and a standard envelope. This item defines the interface and envelope in real C# (per ADR-0010) and the contract tests every transport implementation must pass — it doesn't build either transport implementation itself (separate items, not yet detailed).

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0003-event-driven-backbone.md` (the full design), ADR-0010 (C#/.NET, xUnit contract-test pattern)
- *Interfaces*: none consumed — this item defines one
- *Environment/tooling*: `docs/architecture/tech-stack.md` (local vs. cloud transport row)
- *Test/chaos methodology*: `project-process-framework/domains/software-systems/architecture-patterns.md` — same adapter + contract-test + chaos decorator pattern as `CACHE-001`
- *Business context*: `docs/architecture/ddd/glossary.md` (domain event names this envelope will carry), `docs/architecture/ddd/event-storming.md` (the events that flow through this interface)

**You do not need to know about**
- The bakery domain itself — this interface is domain-agnostic, same as `CACHE-001`
- Azure Event Grid or Redis Streams implementation details — those are separate items

**Out of scope**
- Does not implement `EventGridPublisher`/`EventGridSubscriber` or `RedisStreamsPublisher`/`RedisStreamsSubscriber` (separate items, not yet detailed)
- Does not implement `ChaosEventTransport` (separate item, not yet detailed)
- Does not touch Terraform/Compose config

**Requirements / Acceptance Criteria**
- Interfaces and envelope (C#, per ADR-0010):
```csharp
public interface IEventPublisher
{
    Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default);
}

public interface IEventSubscriber
{
    Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        CancellationToken ct = default);
}

public record DomainEventEnvelope<T>(
    Guid EventId,
    string EventType,
    int SchemaVersion,
    DateTimeOffset OccurredAt,
    string AggregateType,
    string AggregateId,
    long SequenceNumber,
    T Payload
);
```
- A shared xUnit abstract test base class (`EventTransportContractTests`) with an abstract factory for publisher/subscriber pairs, covering at minimum: publish-then-consume returns the same envelope; duplicate `EventId` delivered twice is observable as a duplicate (consumer dedupe is the consumer's job, per ADR-0003 — this test proves the transport *can* deliver a dupe, not that it prevents one); a subscriber only receives events matching its subscribed `eventType`
- Envelope field names match ADR-0003's design exactly — no renamed fields

**Dependencies**
- Blocks: the (not yet detailed) `EventGridPublisher`/`RedisStreamsPublisher` implementation items
- Blocked by: none
- Can be worked in parallel with: `DATA-001`, `AUTH-001`, `CACHE-003`, `CACHE-004`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0003 plus the C# signatures above; no open judgment calls.

**Open Points (working)**
*(none currently)*
