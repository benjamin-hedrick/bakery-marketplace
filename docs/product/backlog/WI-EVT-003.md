> **Status:** Done · evidence: `tools/BakeryMarketplace.Eventing` (Redis Streams transport) and its tests

> **Update 2026-11-08 (documentation pass):** consumer groups are now named per service, and a consumer name on the subscribe call gives a second consumer in one service its own group (register 29; the note of 2026-11-08 on ADR-0003).

```
WI ID:               EVT-003
Title:                RedisStreamsPublisher / RedisStreamsSubscriber implementation
Type:                 Service Implementation
Epic:                 EPIC-EVENTING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 M
```

**Context / Why**
ADR-0003 names Redis Streams as the local event transport — a genuinely different technology from Event Grid, not a "local mode" of the same one. Prioritized ahead of `EVT-002` (EventGridPublisher, cloud-only) since it's what local end-to-end actually needs.

**Inputs / References**
- *Decisions*: ADR-0003 (envelope shape, at-least-once/no-ordering guarantees, dead-letter behavior)
- *Interfaces*: `IEventPublisher`/`IEventSubscriber`, `DomainEventEnvelope<T>` (`EVT-001`)
- *Environment/tooling*: Redis Streams container — default Compose service, not profile-gated (ADR-0003)
- *Test/chaos methodology*: `EventTransportContractTests` (`EVT-001`) — this is also the transport `EVT-004`'s `ChaosEventTransport` will eventually wrap
- *Business context*: none

**You do not need to know about**
- Event Grid or any cloud-specific eventing detail (`EVT-002`, separate)
- Any domain event's payload shape beyond generic `T`

**Out of scope**
- Does not implement `EventGridPublisher`/`Subscriber` (`EVT-002`)
- Does not implement `ChaosEventTransport` (`EVT-004`)

**Requirements / Acceptance Criteria**
- `RedisStreamsPublisher` implements `IEventPublisher` using Redis Streams (`XADD`)
- `RedisStreamsSubscriber` implements `IEventSubscriber` using consumer groups (`XREADGROUP`), filtering by `eventType` to match Event Grid's built-in filtering behavior
- A dedicated dead-letter stream simulates Event Grid's dead-lettering after a configurable max-delivery-attempts count
- Passes the full `EventTransportContractTests` suite against a real local Redis Streams container
- Envelope fields pass through unmodified — the transport doesn't reorder or rewrite content

**Dependencies**
- Blocks: `EVT-004` (chaos decorator wraps this)
- Blocked by: `EVT-001` (done)
- Can be worked in parallel with: `DATA-002`, `CACHE-002`, `AUTH-002`, `AUTH-005`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully specified by ADR-0003 plus `EVT-001`'s contract.

**Interfaces consumed**: none new (implements `IEventPublisher`/`IEventSubscriber`)
**Events published/consumed**: transport-agnostic
**Data touched**: none directly

**Open Points (working)**
*(none currently)*
