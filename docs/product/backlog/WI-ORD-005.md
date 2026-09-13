```
WI ID:               ORD-005
Title:                Publish Order domain events via event backbone
Type:                 Integration
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

**Context / Why**
`ORD-002` raises domain events in-memory; ADR-0003 requires they actually publish through `IEventPublisher` so Notifications, the queue-display read-model, and (later) Reviews/Payments can react.

**Inputs / References**
- *Decisions*: ADR-0003 (envelope, at-least-once/no-ordering, per-aggregate sequencing)
- *Interfaces*: `IEventPublisher` (`EVT-001`), `RedisStreamsPublisher` (`EVT-003`), `Order` aggregate's raised events (`ORD-002`), payload records (`TOOL-001`)
- *Environment/tooling*: local Redis Streams (`DEV-001`)
- *Test/chaos methodology*: reuses `EventTransportContractTests` indirectly via `EVT-003`; this item's own tests confirm the aggregate's events actually get wrapped and sent
- *Business context*: `docs/architecture/ddd/glossary.md` (event names)

**You do not need to know about**
- Any consumer of these events (Notifications, queue display) — this item only publishes

**Out of scope**
- Does not implement any consumer-side logic (`QUE-001`, `NOT-001`, separate items)

**Requirements / Acceptance Criteria**
- Every `Order` state transition's raised event is wrapped in a `DomainEventEnvelope<T>` (correct `EventId`, `EventType`, `AggregateId`=order id, `SequenceNumber` from the aggregate) and published via `IEventPublisher`
- Uses the exact payload records from `TOOL-001` — no ad hoc reshaping
- Integration test (against local Redis Streams) proving a full `Placed → Completed` sequence publishes all five events in the correct envelope shape

**Dependencies**
- Blocked by: `ORD-002`, `EVT-003`
- Can be worked in parallel with: `ORD-006`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Systems/contexts being integrated**: `ordering-service` → event backbone
**Contract being relied on**: `IEventPublisher` and the `TOOL-001` payload shapes not changing without notice

**Open Points (working)**
*(none currently)*
