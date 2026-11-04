> **Status:** In review · built and run locally on `feature/slice-notifications` (2026-11-03); evidence: the Outcome note below; `services/notification-service`

> **Outcome note (2026-11-03):** built in three commits. (1) `ICacheProvider.GetManyAsync` (one `MGET` on Redis; local, resilient and chaos providers; contract tests for all). (2) `IEventSubscriber.SubscribeBatchAsync`: for Redis Streams one poll (up to 10 entries of one event type) is one handler call, the handler returns the event ids that failed, each entry is acknowledged on its own, failed ones are redelivered and dead-lettered like single deliveries; the in-memory transport delivers batches of one. (3) The service: `OrderEventSubscriptions` (six events, batched), `OrderEventNotifier` (skip already-sent events, one contact read per batch, compose, send, return failed ids), `IContactDirectory` with `SeededContactDirectory` (the mock identity's customers) behind `CachedContactDirectory` (one `GetManyAsync`, one batch read for the misses, short negative caching, a cache failure reads through), `INotificationSender` with a recording fake and a log sender that logs ids only, and `SentLedger` (idempotency on `EventId` in the cache provider). `NOT-002` now supplies the wording (`TemplateMessageComposer`).
>
> **Verified (local):** 26 service tests (contract tests for the directory and the sender, the notifier, the real host with the in-memory backend, and one against the local Redis container showing three `OrderPlaced` events as one poll, one contact read and three acknowledgements); 3 new Redis batch-delivery tests and 1 contract test for the transports; whole solution green (catalog 137, ordering 432, tools). Mutation checks: ignoring the sent ledger and reading contacts one by one each failed 2 tests; acknowledging failed batch entries failed 2 tests. The Redis tests ran against the Compose Redis (`REDIS_CONNECTION_STRING=127.0.0.1:6379`).
>
> **Added later the same day:** the service is in the Compose `apps` profile (port 5400); a real-checkout run (`skeleton-smoke.mjs --containers --keep`, 27 tests) produced 66 notifications in the log with no errors (`docs/operations/local-dev.md`); `EventContractTests` (3) tie the subscribed and templated event names to ordering's `OrderEventTypes` and to the shared payload types (renaming an event in ordering failed all 3); a batch runs in one consumer span linked to each event's publisher trace (`EventTracing.StartBatchConsumer`, one Redis test). Notification service tests: 45; eventing tests: 60.
>
> **Not done / limits:** no real provider (the log sender delivers nothing); the ledger and contact cache are in process unless `Cache:Backend=redis` (a restart with the in-process cache can repeat a message; a crash between send and mark can too); not run on Azure, and the batch trace span was seen in the local Aspire dashboard (containers, `APPS_OTLP_ENDPOINT`), not in Jaeger or through the collector's safety processor; contacts are seeded, not a store (register 138). `Events:MaxStreamLength` is set by the publisher (ordering), not here: this consumer keeps up within a poll, the lead said the limit can be increased and ordering now sets 100000 (register 75).

```
WI ID:               NOT-001
Title:                Notification service: consume order events and dispatch through a sender adapter
Type:                 Service Implementation
Epic:                 EPIC-NOTIFICATIONS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 L
```

**Context / Why**
Ordering publishes six order events (`OrderPlaced`, `OrderConfirmed`, `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted`, `OrderCancelled`) through the outbox, and nothing consumes them except the vendor queue. Notifications is a Conformist context (`docs/architecture/ddd/bounded-contexts.md`): it has no domain rules, it turns events into messages. This item is the second consumer of the event backbone and the first real use of per-service consumer groups (register item 29).

**Inputs / References**
- *Decisions*: ADR-0003 (at-least-once, consumers dedupe on `EventId`), ADR-0009 (notification is one of four services), ADR-0016 (trace context), ADR-0006/0008 (the service validates what it exposes itself)
- *Interfaces*: `IEventSubscriber` and `RedisStreamsEventTransport` with `serviceName: "notification-service"`; payload records in `BakeryMarketplace.EventSchemas`; pattern: `services/catalog-service/src/Services/VendorEventSubscriptions.cs`
- *Open items*: 75 (stream retention is sized when the first consumer exists), 29 (resolved; group per service)

**Requirements / Acceptance Criteria**
- A hosted subscriber in `notification-service` subscribes to the six order event types. Each handler is idempotent on `EventId` (a repeat sends nothing a second time) and a failure leaves the message pending for redelivery, as the transport already does.
- Delivery goes through `INotificationSender` (adapter pattern, as in `tools/`): a recording fake for tests and a local sender that writes the message to the log without the address or the body's personal data. A shared abstract contract-test base is inherited by every sender. No real email provider is built.
- Contact lookup goes through `IContactDirectory` with a **batch** signature (`GetContactsAsync(IReadOnlyCollection<string> customerIds)`), implemented over seeded data (the mock identity's customers). The contact address is **not** added to the events (no personal data on the backbone). A customer with no contact is recorded as "no contact" and skipped, not retried.
- **Batching (decided 2026-11-03):** the transport runs the handlers of one subscription one at a time, so a timer-based micro-batcher inside a handler could never fill a batch. Batching is done where the transport already reads: `RedisStreamsEventTransport` takes up to 10 entries per poll. Add `SubscribeBatchAsync<T>` to `IEventSubscriber` (and the in-memory transport), which hands the handler the entries of one poll together; the handler makes one batch contact read for the customers in it, then sends. Each entry is still acknowledged individually, after its own send, so at-least-once and per-event idempotency are unchanged. This is a shared-interface change in `tools/` with contract tests for both transports.
- **Caching (decided 2026-11-03):** a `CachedContactDirectory` decorator (cache-aside) over `IContactDirectory`, using `ICacheProvider` so the backend can be in-process or a distributed cache. Add `GetManyAsync<T>(IReadOnlyCollection<string> keys)` to `ICacheProvider` (one round trip: `MGET` on Redis), with the `CacheProviderContractTests` extended and `ResilientCacheProvider` and the chaos decorator updated; a miss, a down cache or a malformed entry falls through to the directory. Misses are read from the directory in one batch call. TTL is short (minutes). Negative results ("no contact") are cached more briefly. A deployed distributed cache loses connection sharing across serverless instances (each instance holds its own multiplexed connection), so batching within an instance matters more there; an in-process layer in front of the distributed one is a later option, measured first (`ADR-0014` governs caching layers).
- `Events:MaxStreamLength` is given a value with the consumer's maximum backlog stated (register item 75).
- Logs carry order id, event id and type only: no address, name or free text.
- Tests: batch handler (one contact read per poll, per-entry ack, one failing entry stays pending while the rest are acknowledged), cache hit, miss, partial hit and cache down, handler idempotency, redelivery after a failing sender, unknown customer, contract tests for the sender and the directory, and one test against the local Redis (skipped without `REDIS_CONNECTION_STRING`).

**Out of scope**
- Templates and message wording (`NOT-002`); a real email, SMS or push provider; customer notification preferences; allergy warnings and low-stock alerts (see `NOT-002`).

**Dependencies**
- Blocked by: none (`ORD-005` and `EVT-003` are Done)
- Blocks: `NOT-002`
