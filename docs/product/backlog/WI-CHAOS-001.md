> **Status:** In review · evidence: `tools/BakeryMarketplace.Chaos`, `tools/tests/BakeryMarketplace.Chaos.Tests`, `services/ordering-service/tests/OrderingService.Tests/ChaosHostTests.cs`, `chaos/`

```
WI ID:               CHAOS-001
Title:                Chaos scenarios, phase 1: the foundation, the events and cache layers, the C# services
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-EVENTING, EPIC-CACHING
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 M
```

**Context / Why**
ADR-0024 (Proposed) and `docs/architecture/chaos-scenarios-proposal.md`: faults introduced in a thin wrapper at an interface the system already has, chosen by a seed and a scenario file, with the service and its business logic untouched, usable in a running stack and not only in unit tests, and recorded in a journal. This item is the foundation and the first two layers; the other layers, the TypeScript library and the BFF gate are later phases (see the proposal, section 6).

**As built (2026-11-09, local only)**
- `chaos/`: `scenarios/*.json` (`flaky-broker`, `slow-cache`, `broker-outage`), `test-vectors.json` (the expected numbers of the decision function, computed independently of the C# code), `README.md`.
- `tools/BakeryMarketplace.Chaos`: `ChaosScenario` (JSON, strict: an unknown layer, an unknown setting or a rate outside 0 to 1 fails at startup), `ChaosDecider` (the keyed decision: SHA-256 of `seed|layer|fault|key`, so the same scenario hits the same operations on every run, under concurrency), `ChaosRuntime` and `ChaosGate`, `ChaosJournal` and `ChaosRequestScope`, the `events` layer (`ChaosEventTransport`, moved here from `BakeryMarketplace.Eventing`) and the `cache` layer (`ChaosCacheProvider`, moved from `BakeryMarketplace.Caching`; `ChaosOptions` and the two old `AddChaos...` extensions are gone), `AddBakeryChaos`, `AddChaosCachePrimary`, `WrapCachePrimary`, and the response indicator (`X-Chaos-Scenario` always while a scenario is on; `X-Chaos-Injected: layer:fault,...` for the faults injected while that request was served; response-only, no ids or keys).
- Wiring: one line in each service's `Program.cs` (`AddBakeryChaos`), plus the cache hook where the primary cache is built (catalog: `AddChaosCachePrimary` after `AddRedisCacheProvider`; notification: `WrapCachePrimary` around the Redis store), so the result is `Resilient(Chaos(primary))`. The four services reference the new project; no handler or domain class changed.
- Gate: chaos refuses to start unless the host is Development or `Deployment:Environment` is `dev` (the deployed dev stack runs as Production, so its own setting identifies it; infra does not set it yet). A second guard, `scripts/ci/tests/chaos-not-deployed.test.mjs`, fails if any deployment configuration outside `infra/environments/dev` names a chaos setting.
- Tests: `Chaos.Tests` (51: the shared vectors, determinism under concurrency, scenario validation, the gate, the journal, the request scope, the wiring in a DI container, the indicator on a test server, `Resilient(Chaos(primary))`), the decorators' tests (`ChaosEventTransportTests`, 13 plus the contract suite through the decorator; `RedisChaosEventTransportTests`, 6, real Redis; `ChaosCacheProviderTests`), and `ChaosHostTests` in the ordering host: an order placed during a broker outage is accepted (201), the response lists `events:outage`, nothing is delivered, and after the outage the outbox relay's sweep delivers the `OrderPlaced` event. Every test that asserts the system coped first asserts the journal shows the fault. Mutation checks (outage injection disabled on purpose) failed the host test and three decorator tests.

**Changes from the original plan**
- Out of scope here and recorded in register 169: the other layers (repository, payment, notification sender, catalog gateway, broadcast), the TypeScript library and the BFF gate (phases 2 to 4), a scenario run against the whole real stack with evidence, and turning chaos on in the dev environment (needs `Deployment__Environment=dev` in its Terraform).

**Dependencies**
- Blocked by: `EVT-004`, `CACHE-004` (the decorators it absorbs).
