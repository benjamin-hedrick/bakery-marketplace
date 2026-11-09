> **Status:** In review · evidence: `tools/BakeryMarketplace.Chaos/ChaosEventTransport.cs` and `tools/tests/BakeryMarketplace.Eventing.Tests/ChaosEventTransportTests.cs`

> **Update 2026-11-09:** the decorator moved into `BakeryMarketplace.Chaos` and now reads a scenario (seed, keyed decisions, journal, settings named as in `chaos/README.md`) instead of `ChaosEventOptions`; see `WI-CHAOS-001` and ADR-0024. `HandlerFailuresInjected`, `Seed` and the Production constructor flag are replaced by the journal and the central gate.

```
WI ID:               EVT-004
Title:                ChaosEventTransport decorator + failure proof tests
Type:                 Test/Mock/Chaos
Epic:                 EPIC-EVENTING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 S
```

**Context / Why**
The chaos decorator for events was planned with the transport (ADR-0003, `EVT-001`) and was left out when the transport was built; only the cache had one (`CACHE-004`). Found 2026-11-09 when the README's "chaos decorators" were checked against the code. Built 2026-11-09 so the outbox's ordering rule and the consumers' idempotency rule are shown to hold under injected faults, not only asserted.

**As built**
- `ChaosEventTransport` wraps an `IEventPublisher` and an `IEventSubscriber` (usually one transport object) and injects, per `ChaosEventOptions`: publish failures (`PublishFailureRate`), latency (`InjectedLatency`), an outage window with recovery (`OutageWindow`), lost events that report success (`DropRate`), the same event delivered twice (`DuplicateRate`), an event held back and delivered after the next one (`ReorderRate`, with `ReleaseHeldAsync` for a last event), and consumer handlers that fail (`HandlerFailureRate`, for single and batch handlers). A `Seed` makes the random choices repeatable. All settings default to off.
- Production gate as for the cache (ADR-0002): the constructor throws with `isProduction: true`, and `AddChaosEventTransport` throws for a Production host. Each has its own test.
- Tests (`ChaosEventTransportTests.cs`): the whole shared `EventTransportContractTests` suite passes through the decorator with chaos off; each injected failure is shown to happen; the outbox's `PublishInOrderAsync` stops at the first failure so nothing overtakes it and sends everything in order after the outage ends; a consumer that tracks `EventId` copes with duplicates. `HandlerFailuresInjected` counts the injected handler failures so a test or demo can show chaos happened. Mutation checks (injection disabled on purpose) failed 3 of 13 in-memory tests and 3 of 6 Redis tests; the first version of the two half-failing Redis tests passed with chaos off, so they now assert that failures were injected.
- Against the real Redis Streams transport (`RedisChaosEventTransportTests`, 6 tests, run 2026-11-09 against the Compose `redis-events`; skipped without `REDIS_CONNECTION_STRING`): handlers failing half the time (single and batch) are redelivered until every message is handled and nothing is dead-lettered; a handler that always fails is dead-lettered after the maximum attempts without running; a duplicate reaches the consumer twice and an idempotent consumer applies it once; reordered events arrive reversed and a consumer checking sequence numbers keeps the newest state; a publish outage keeps events out of the stream and they flow after it.

**Changes from the original plan**
The catalog entry listed duplicate, out-of-order, delayed and dropped delivery; all are built. The decorator is not wired into any service or the Compose stack (register 169).

**Dependencies**
- Blocked by: `EVT-001`, `EVT-003` (done)
