> **Status:** In review · evidence: `tools/BakeryMarketplace.Chaos` (repository and broadcast layers), `services/ordering-service/src/Chaos`, `services/notification-service/src/Chaos`, their tests, `chaos/scenarios/checkout-trouble.json`

```
WI ID:               CHAOS-002
Title:                Chaos scenarios, phase 2: the repository, broadcast, payment, catalog-gateway and notification-sender layers
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-DATA-STORE, EPIC-ORDERING, EPIC-NOTIFICATIONS
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 M
```

**Context / Why**
Phase 2 of ADR-0024 (`docs/architecture/chaos-scenarios-proposal.md`, section 6): the other interfaces a scenario can disturb, so a whole checkout can be run under chaos, not only the event transport.

**As built (2026-11-09, local only)**
- `repository` (in `BakeryMarketplace.Chaos`): `ChaosRepository<T>` and `ChaosBatchFactory` inject a Cosmos 503 (`failureRate`), a lost optimistic-concurrency check on a conditional save or batch (`conflictRate`: `null` or `false`, as the contract says), latency and an outage window. `AddBakeryChaos` wraps every registered `IRepository<>` and the `IBatchFactory`.
- `broadcast`: `ChaosBroadcastPublisher` and `ChaosBroadcastSubscriber` inject a failed publish, a lost publish, a lost delivery, latency, an outage window. The message text is never journaled (a hash is the key).
- `payment` and `catalog` (in ordering): `ChaosPaymentProcessor` (failure, decline, latency, outage) and `ChaosCatalogGateway` (the `DownstreamUnavailableException` a dead catalog gives, a refused reservation, latency, outage). `notification` (in notification): `ChaosNotificationSender` (failure, latency, outage; keyed by event id, never by address or name). Each is registered with one `AddChaosLayer` line in its service's `Program.cs`.
- `ChaosLayer.BeforeAsync` and `InjectAttempt` give every layer the same keyed, attempt-aware decisions and journal entries. `ChaosPlan` records which layers a process wrapped; a layer a scenario names that a process has no interface for is reported once the host is up, not an error.
- Scenario `checkout-trouble` (payment latency and declines, catalog unavailable and rejecting, repository conflicts and latency, broadcast drops).
- Tests: each decorator passes its interface's shared contract suite with chaos off (repository, concurrency, batch, broadcast, sender); each fault is shown to happen, with the journal asserted first; keyed determinism and retries judged afresh; DI wiring (`AddBakeryChaos` over repositories, batches and broadcast, `AddChaosLayer`, the plan). In the real ordering host: 402 for a declined payment with the reservation released, 503 `downstream_unavailable` for an unreachable catalog with nothing stored, 409 for a refused reservation, the same orders failing on every run, and today's 500 for a failing processor and for a failing store (register 170). Mutation checks (decline and reject injection disabled) failed the two matching host tests.

**Changes from the original plan**
- Not built: the contact directory layer (not in the proposal's list), the TypeScript library and the BFF gate (phase 4), a scenario run on the whole real stack with evidence (phase 3), the equivalence tests per call site. The repository layer is exercised through the in-memory repositories and the decorator's tests, not against the real Cosmos emulator.
- The proposal said a layer needing an absent registration fails at startup; a scenario serves a whole stack, so it is reported as not applicable instead.

**Dependencies**
- Blocked by: `CHAOS-001`.
