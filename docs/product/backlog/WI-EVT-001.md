> **Status:** Done · evidence: `tools/BakeryMarketplace.Eventing` and `tools/tests/BakeryMarketplace.Eventing.Tests`

```
WI ID:               EVT-001
Title:                Define IEventPublisher/IEventSubscriber interfaces + envelope + contract tests
Type:                 Interface/Contract
Epic:                 EPIC-EVENTING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text is in git history (`git log -- docs/product/backlog/WI-EVT-001.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
ADR-0003 establishes the event-driven backbone design: Azure Event Grid (cloud) and Redis Streams (local), at-least-once delivery, per-aggregate sequencing and a standard envelope. This item defines the interfaces and envelope in C# (ADR-0010) and the contract tests every transport must pass. It does not build a transport; `EVT-003` builds the Redis Streams one.

**What exists** (`tools/BakeryMarketplace.Eventing`)
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
    Guid EventId, string EventType, int SchemaVersion, DateTimeOffset OccurredAt,
    string AggregateType, string AggregateId, long SequenceNumber, T Payload,
    string? Traceparent = null);
```
- An in-memory transport (`InMemoryEventTransport`) and the Redis Streams transport (`RedisStreamsEventTransport`, `EVT-003`); `EventTracing` carries the trace context across the hop.
- A shared abstract contract-test base, `EventTransportContractTests`, which every transport's tests inherit. It covers publish-then-consume returning the same envelope; a duplicate `EventId` being observable as a duplicate (consumer dedupe is the consumer's job per ADR-0003); and a subscriber receiving only the event type it subscribed to.
- Envelope field names match ADR-0003 exactly. The tools test project passed on 2026-10-30 (16 Eventing tests; the Redis ones use a real Redis only when one is running, otherwise they fall back, see `CLAUDE.md`).

**You do not need to know about**
- The bakery domain: the interface is domain-agnostic. Event Grid and Redis Streams internals are other items.

**Out of scope**
- `EventGridPublisher` and `EventGridSubscriber` (`EVT-002`, not built), a chaos transport, and Terraform or Compose configuration.

**Acceptance criteria (as met)**
- The interfaces and envelope above exist with the ADR-0003 field names, and the contract-test base is shared by the transports.

**Changes from the original plan**
- `DomainEventEnvelope` has a ninth field, `Traceparent` (optional), added by ADR-0016 so asynchronous hops are traceable; consumers use span links. The change was delivered under `WI-PORT-005`. The original envelope in this spec had eight fields.
- The adapter-and-chaos-decorator test pattern the plan cited is described in `CLAUDE.md` and `docs/architecture/`; a chaos transport was not built then; it was built later as `EVT-004` (2026-11-09).

**Dependencies**
- Blocks (since built): `EVT-003`. Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Open Points (working)**
*(none currently)*
