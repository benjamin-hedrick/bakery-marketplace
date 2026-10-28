> **Outcome note (2026-10-28):** built on `feature/order-events`. Raised events are stored **inside the order document**, in the same single write as the state change (`OrderStore.TryCreateAsync` / `TryUpdateAsync`), so an order and its pending events cannot disagree. Checkout then publishes them inline (bounded by `Outbox:InlinePublishTimeoutSeconds`, default 2; a failure or timeout never fails the checkout), and `OutboxRelay` sweeps whatever the inline path missed. Delivery is at-least-once with **deterministic event ids** (hash of order id and sequence number), so a repeat carries the same id and consumers dedupe (ADR-0003). Events of one order publish in sequence order and stop at the first failure. The request's `traceparent` is stored with each entry and travels in the envelope (ADR-0016). Payloads are the `TOOL-001` records. Resolves open item 68 and the ordering half of item 30.
>
> **The sweep:** one cross-partition query on a sparse `pendingSince` property (UTC milliseconds, **absent** when nothing is pending, so the index only holds orders that need work). The relay backs off while idle (base 5 s, up to 60 s), varies its delay by ±20% so instances do not poll in step, skips events younger than a 3 s grace period (the inline publish is probably still running), and is woken at once by an inline failure on the same instance. That in-memory signal is an accelerator, never a gate: a crashed instance cannot signal, so the timed sweep stays. Settings are under `Outbox:*`. Scale-up options are in open item 72.
>
> **Configuration change:** `Events:Backend` must now be `redis` or `inmemory` for ordering; the service refuses to start otherwise (`appsettings.Development.json` sets `redis`; the test host sets `inmemory`). Catalog still defaults silently (open item 73).
>
> **Verified (local):** 258 ordering tests pass (3 emulator-gated skipped), also on Linux in a container beside a real Redis (build, format gate, tools, catalog 101, ordering). New tests cover the store (atomic write, deterministic id, `pendingSince` present only while pending, stale-document refusal, cross-customer pending query), the publisher (order, stop-at-first-failure, repeat with the same ids, lost cleanup race, unknown type, trace context), the relay (grace period, broker down then up, backoff and jitter, wake signal, running loop), checkout (inline publish, outage, slow broker, repeat, declined payment) and the real host (event reaches the backend; startup refused without `Events:Backend`). Six mutation checks (continue after failure, random ids, no wake, `pendingSince` always set, ignoring the grace period, never cleaning up) each failed a test. **Real stack** (compose Redis, Cosmos emulator, mock issuer, catalog, ordering, PKCE logins): the existing checkout script's 6 created orders produced 6 `OrderPlaced` stream entries with the stored trace context; with Redis stopped a checkout returned `201` after the 2 s inline timeout, and the relay published the event within about 4 s of Redis returning.
>
> **Not done:** the criterion "full `Placed → Completed` against local Redis Streams": the five-event lifecycle test runs against the in-memory transport and the Redis path was checked by hand for `OrderPlaced` only. Nothing publishes the later events yet because nothing performs those transitions (`ORD-007`); `PickupWindowScheduled` / `OrderReadyForPickup` belong to `ORD-003`. Not run on Azure; not measured on real Cosmos. Open items 72 to 75.

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
