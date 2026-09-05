# ADR-0003: Event-Driven Backbone

**Status:** Accepted

## Context

Multiple bounded contexts (Notifications, Payments, Reviews, Admin/Moderation, and eventually a Delivery Fulfillment Strategy per ADR-0001) need to react to domain events published by Ordering, Vendor Onboarding, and Catalog without those upstream contexts knowing who's listening — this is the Open Host Service / Conformist / Anticorruption Layer relationships already named in the bounded context map.

Two things make this ADR different from ADR-0002 (caching):
- There is **no local equivalent** of the managed cloud service — Azure Event Grid can't run locally, so local dev needs a genuinely different technology, not just a "local mode" of the same one.
- Delivery order and duplication have real correctness implications here (an out-of-order or duplicated `OrderCompleted` event is a bigger deal than a stale cache read), so this ADR has to be explicit about the guarantees consumers can and can't rely on.

## Decision

**Cloud transport: Azure Event Grid.** A single custom-topic namespace for the domain event stream (avoiding topic-per-event-type sprawl); subscribers filter using Event Grid's built-in `eventType` filtering rather than separate topics per consumer.

**Local transport: Redis Streams**, running in its own Compose service that's part of the **default service set** — deliberately **not** gated behind the `with-redis` profile from ADR-0002. It has the same container lifecycle as everything else in Compose (starts/stops normally with `docker-compose up`/`down`); the distinction is only that it isn't opt-in behind a profile flag the way the cache Redis is. Caching can drop to zero external dependency locally because it has a true local-mode fallback; eventing can't, because a working event backbone is core function for local dev/test, not an optional resilience layer. This is treated as an accepted asymmetry between the two ADRs, not an inconsistency.

**Event envelope** (published by all producers, defined in `/tools/event-schemas`):

```json
{
  "eventId": "uuid",
  "eventType": "OrderPlaced",
  "schemaVersion": 1,
  "occurredAt": "iso8601",
  "aggregateType": "Order",
  "aggregateId": "uuid",
  "sequenceNumber": 3,
  "payload": { "...": "..." }
}
```

**Guarantees consumers can rely on — and can't:**
- **At-least-once delivery, no ordering guarantee.** Consumers must be idempotent: dedupe on `eventId` against a processed-events set with a business-appropriate TTL.
- **No cross-aggregate ordering.** `sequenceNumber` is scoped per `aggregateId`. Consumers that care about order (e.g., an Order status read-model) use it to detect and reject/retry out-of-order delivery; consumers that don't (Notifications) ignore it.
- **Dead-lettering**: Event Grid dead-letters to storage after max delivery attempts; the local Redis Streams setup simulates the same behavior with a dedicated dead-letter stream, so the failure path is testable locally, not just in cloud.

**Schema versioning**: additive fields only wherever possible. A breaking change is published as a new versioned event type (`OrderPlacedV2`) alongside the old one during a migration window — never a mutated shape in place. `/tools/event-schemas` is the single published-language source of truth all producers and consumers import from.

**Same adapter/contract-test/chaos pattern as ADR-0002:**

```
EventPublisher / EventSubscriber (interfaces)
 ├─ EventGridPublisher / EventGridSubscriber   — cloud
 └─ RedisStreamsPublisher / RedisStreamsSubscriber — local

ChaosEventTransport (decorator, wraps either)
 ├─ inject duplicate delivery
 ├─ inject out-of-order delivery
 ├─ inject delivery delay
 └─ inject dropped messages (to prove dead-letter/retry handling)
```

A shared contract-test suite runs against both transports ("publish then consume returns the event," "duplicate eventId is deduped," "dead-letter path is reachable"), which matters more here than in ADR-0002 precisely because the two transports are genuinely different technologies, not two flavors of the same one. Chaos mode is gated the same way as ADR-0002 — structurally disabled in production, not just off by default.

## Consequences

**Positive**
- Producers stay ignorant of consumers, preserving the ACL/Open-Host-Service boundaries from the bounded context map
- The contract-test suite gives real confidence that "works locally" predicts "works in Event Grid," despite the transports being different technologies
- Dead-letter and chaos testing are exercisable locally, not just theorized

**Negative / accepted limitations**
- Local Redis Streams and cloud Event Grid are not identical in behavior (e.g., exact retry backoff timing differs) — the contract tests cover functional behavior, not performance parity. This is accepted; performance-sensitive eventing questions should be validated in staging, not assumed from local tests.
- Requiring idempotent consumers and per-aggregate sequence handling is real implementation overhead on every consumer, not just the producers — this is the cost of choosing an at-least-once, no-global-order transport rather than something stronger (and cheaper to skip).
- The local event backbone is included in Compose's default service set rather than being profile-gated like the cache — a small, deliberate departure from the "free-tier-first, dependency-free by default" principle in `tech-stack.md`, justified because eventing is core function here rather than an optimization. It runs and stops with the normal Compose lifecycle like any other service; it just isn't optional.
- Surge handling, deeper replay/retry semantics, and fan-out patterns beyond simple multi-subscriber delivery are deliberately not addressed here — a reasonable scope cut given how fragmented the transport landscape is (Kinesis, Kafka, Redis Streams, SQS/MQ, Service Bus, Event Grid each make different tradeoffs here). Worth revisiting post-MVP if throughput or replay needs grow.

## Alternatives considered

1. **Kafka (or a managed equivalent).** Rejected — stronger ordering/replay guarantees, but heavier operationally and no meaningful free tier fit for this project's scale; overkill relative to actual throughput needs.
2. **Azure Service Bus instead of Event Grid.** Considered — Service Bus offers FIFO/session-based ordering, which would remove the need for the `sequenceNumber` workaround. Rejected for now because Event Grid's simpler pub/sub model and free-tier fit better match current scale; revisit if ordering requirements grow beyond what per-aggregate sequencing can handle.
3. **Synchronous REST calls between contexts instead of an event backbone.** Rejected — reintroduces the tight coupling the bounded context map's ACL/Open-Host-Service relationships are specifically designed to avoid.
4. **Same Redis instance for both caching (ADR-0002) and local event streams.** Considered, rejected — conflates two different toggles/concerns and would make the cache's "fully optional, zero-dependency" property depend on eventing's "always-on" property. Kept as separate Compose services instead.

## Related

- Bounded context map — Open Host Service, Customer/Supplier, Conformist, and ACL relationships this backbone implements
- ADR-0001 — Fulfillment Strategy subscribes to `OrderReadyForFulfillment` / `OrderFulfillmentCompleted` via this backbone
- ADR-0002 — shares the adapter/contract-test/chaos pattern; deliberately differs on "can local drop to zero dependency"
- `tech-stack.md` — free-tier-first principle (with the accepted local-eventing exception noted above)
- Glossary — domain event names formalized here into the envelope structure
