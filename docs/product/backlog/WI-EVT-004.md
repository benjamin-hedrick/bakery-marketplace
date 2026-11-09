> **Status:** In review · evidence: `tools/BakeryMarketplace.Eventing/ChaosEventTransport.cs` and `tools/tests/BakeryMarketplace.Eventing.Tests/ChaosEventTransportTests.cs`

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
- `ChaosEventTransport` wraps an `IEventPublisher` and an `IEventSubscriber` (usually one transport object) and injects, per `ChaosEventOptions`: publish failures (`PublishFailureRate`), latency (`InjectedLatency`), an outage window with recovery (`OutageWindow`), lost events that report success (`DropRate`), the same event delivered twice (`DuplicateRate`), and consumer handlers that fail (`HandlerFailureRate`, for single and batch handlers). A `Seed` makes the random choices repeatable. All settings default to off.
- Production gate as for the cache (ADR-0002): the constructor throws with `isProduction: true`, and `AddChaosEventTransport` throws for a Production host. Each has its own test.
- Tests (`ChaosEventTransportTests.cs`): the whole shared `EventTransportContractTests` suite passes through the decorator with chaos off; each injected failure is shown to happen; the outbox's `PublishInOrderAsync` stops at the first failure so nothing overtakes it and sends everything in order after the outage ends; a consumer that tracks `EventId` copes with duplicates. A mutation check (outage and duplicate injection disabled on purpose) failed three tests.

**Changes from the original plan**
The catalog entry listed duplicate, out-of-order, delayed and dropped delivery. Out-of-order delivery is **not built**; the rest are. The decorator is not wired into any service or the Compose stack, and it has not been run around the Redis Streams transport (in-process over the in-memory transport only). Both are listed in the open-items register (item 169).

**Dependencies**
- Blocked by: `EVT-001`, `EVT-003` (done)
