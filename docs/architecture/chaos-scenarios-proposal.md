# Chaos scenarios: proposal and assessment

> **Status: proposal; the lead's decisions of 2026-11-09 are recorded in section 7 and the rules are written as [ADR-0024](adr/0024-chaos-scenarios.md) (Proposed). Phase 1 was built the same day (`WI-CHAOS-001`, In review; section 8); the table in section 2 is the position before it. Nothing else here is built.**

## 1. The goal

A *scenario* is a seeded, configured set of faults that is applied in a thin wrapper layer at an interface the system already has, so that:

- the service, its business logic and the external pieces stay untouched;
- slow, delayed, out-of-order, duplicated, erroring, rejecting and malformed behaviour can be introduced at that layer, chosen by seed and configuration;
- the test (or demo) knows exactly which chaos is on, and can see afterwards what was injected;
- scenarios replace the side channels that tests use today to disturb or inspect a running system (the Android flow-control server, the web app's `x-delay-ms` and `x-fixture` headers), instead of adding to them.

This is the "adapter + fallback + contract-test + chaos decorator" pattern of ADR-0002 and `docs/architecture/patterns.md`, taken from per-library unit tests to whole-system runs.

## 2. Where we are (built and run 2026-11-09)

| Goal element | Status | Evidence |
|---|---|---|
| Wrapper layer at an existing interface, business logic untouched | **Met for two seams** | `ChaosCacheProvider` (`ICacheProvider`), `ChaosEventTransport` (`IEventPublisher` + `IEventSubscriber`); neither knows any business type |
| Seeded | **Partly.** `ChaosEventTransport` takes a `Seed`; the cache decorator does not. The seed makes the *sequence of draws* repeatable, not *which event* gets which draw once calls interleave (see section 5) | `Seeded_MakesRandomFailuresRepeatable` passes for a single caller |
| Configurable and injectable | **Not met.** Options are built in test code; nothing binds them from configuration, nothing loads a named scenario, and no service host can switch a decorator on | `AddChaosEventTransport` exists but no `Program.cs` calls it |
| Tests know what chaos is on | **Partly.** The test that builds the decorator knows its options; `HandlerFailuresInjected` is the only record of what happened. There is no journal of injected faults | |
| Fault catalogue (slow, delayed, out of order, errors, rejections, malformed) | **Partly** for events: errors, latency, outage window, drop, duplicate, reorder, failing handlers. **Not built:** rejection (a typed refusal such as a 409, a payment decline), malformed (corrupt or unknown-version envelope), slow *handlers* (latency is publish-side only), partial batch failure by chosen ids | |
| Covers the seams the system has | **2 of 8.** Not wrapped: `IRepository<T>`, `IPaymentProcessor`, `INotificationSender`, `ICatalogGateway`, `IBroadcastPublisher`/`Subscriber`, `IContactDirectory` | |
| Replaces the test control paths | **Not yet, and only partly possible** (section 4) | |
| Runs against the whole system | **Not met.** Proven in-process, and around the real Redis Streams transport in tests; never in a running service | `RedisChaosEventTransportTests` (6 of 6 against the Compose Redis) |

**Verdict:** the design is right and the first two pieces are built to it, but the part that makes it a *scenario* (configuration, a seed that drives every decision, a journal, the other seams, a way into a running host) does not exist yet, so the goal is about a third met. The existing tests are decorator unit tests, not scenarios.

## 3. Proposed design

### 3.1 A scenario is data

One JSON document, named, versioned and committed (`scenarios/*.json`), for example:

```json
{
  "name": "flaky-broker-slow-payment",
  "seed": 20261109,
  "layers": {
    "events":  { "publishFailureRate": 0.3, "duplicateRate": 0.2, "reorderRate": 0.2, "handlerFailureRate": 0.3 },
    "payment": { "latencyMs": 800, "rejectRate": 0.1, "rejectReason": "processor_unavailable" },
    "catalog": { "outageWindowSeconds": 10, "from": "T+5s" }
  }
}
```

It is selected by configuration (`Chaos:Scenario=<path or name>`) in a service host, or passed as an object by an in-process test. Chaos is a property of the host's configuration, not of the code in the request path.

### 3.2 Decisions come from the seed, not from call order

Today a `Random` is drawn once per call. With several threads or two instances the draws interleave, so the same seed produces different faults on different events. Each decision should instead be a pure function of `(seed, layer, operation key)`, for example a hash of the seed, the layer name and the event id (or the order id or request key). The same scenario then fails the *same* events every run, even under concurrency, which makes a failing run reproducible and lets a test name the events it expects to be hit. Outage windows are measured from scenario start, not from construction.

### 3.3 Layers: the interfaces we already have

| Layer | Interface | Faults that make sense | Notes |
|---|---|---|---|
| events | `IEventPublisher`, `IEventSubscriber` | built: failure, latency, outage, drop, duplicate, reorder, failing handler. Add: slow handler, malformed envelope (null payload, unknown `SchemaVersion`, unknown event type), partial batch failure | malformed is limited to what the typed envelope can express; a corrupt byte stream sits below the interface |
| cache | `ICacheProvider` | built (`ChaosCacheProvider`); move to the same scenario config and seed rule | |
| repository | `IRepository<T>` | latency, transient error, ETag conflict (the contract already has one), not-found | needs a new decorator |
| payment | `IPaymentProcessor` | latency, decline, processor unavailable | new decorator; the checkout already handles a decline and a failure |
| notification | `INotificationSender` | latency, transient error, rejection | new decorator |
| catalog gateway | `ICatalogGateway` | latency, `DownstreamUnavailableException`, reservation refused | new decorator; ordering's partial-failure handling (orphan reservations) is the interesting part |
| broadcast | `IBroadcastPublisher` | drop, delay | the vendor queue's polling fallback is what this proves |

### 3.4 The wrapper is applied once, in the composition root

One extension, `services.AddBakeryChaos(configuration, environment)`, called after the service's own registrations, finds the registered interface for each configured layer and replaces it with the chaos wrapper around the original. A scenario with no layers (or no `Chaos` section) does nothing. **The only service change is that one line in each `Program.cs`**; handlers, services and domain code are not edited. This is the part that needs the lead's approval, because it is a change to the four services' startup.

### 3.5 Gating (hard, as ADR-0002)

- Throws at startup in the Production environment when any chaos is configured, as the two decorators already do.
- Needs an explicit `Chaos:Enabled=true` as well, so a stray scenario file does nothing.
- Logs one loud warning at startup naming the scenario and seed, and puts `chaos: <scenario>` in the health response's detail so a human cannot miss it.
- Terraform and the deployed environment never set it; a pipeline check (the destroy-guard style) fails if the key appears in `infra/`.

### 3.6 The test knows what is on, and sees what happened

- **Known:** the scenario file is the test's input; the test cites it by name and seed.
- **Journal:** every injected fault is recorded as one structured log line and, in-process, in a `ChaosJournal` (layer, fault, operation key, time). A scenario run ends with a summary (counts per fault) that is committed as evidence next to the run.
- **Rule for every scenario test:** assert the journal shows the fault happened *before* asserting the system survived it. Without that, a survival assertion passes whether or not chaos fired (this is the weakness the first Redis chaos tests had).
- **No new endpoint.** The journal is read from the log (or a file the host writes at shutdown), not from a test-only HTTP route, per the CLAUDE.md rule on test-only functionality.

### 3.7 The BFF and the other Node processes

The BFF handles every request in one `http.createServer` callback (`services/graphql-bff/src/server.ts`), and its first steps (`/healthz`, the 404 for other routes, then the rate-limit check "before the body is read or anything is called") are already a request pipeline. A chaos gate sits in the same place: before the body is read it can wait, answer with a chosen status and body (503, 429, a GraphQL error), destroy the socket, or never answer, and it never calls a service. That is the request-level layer: the BFF process is up, but the client behaves as if it were not, without a stop command. A second layer wraps the BFF's `CatalogClient` and `OrderingClient` (they are already injected through `createServer`'s `deps`), the TypeScript equivalent of the C# gateway wrappers. The gate is attached in `main.ts` only. The Next.js servers' proxies to the BFF (`pages/api/graphql.ts`) can take the same gate. The Android app reaches the BFF directly, so the BFF's gate covers it.

The limit: an in-process gate cannot give "connection refused" or a process that is simply gone; that symptom needs the process stopped.

## 4. What this replaces, and what it does not

Honest mapping against the mechanisms listed in register 150 and 155:

| Mechanism today | Replaced by a scenario? |
|---|---|
| Flow-control `POST /bff/stop` and `/bff/start` (BFF unreachable) | **Mostly yes, with the TypeScript layer (section 3.7).** A gate at the head of the BFF's request handler can delay, reject or cut a request while the process stays up, so the client sees a timeout, a 503 or a dropped connection. It cannot produce "connection refused", which only a stopped process gives; whether a flow needs that exact symptom is to be checked flow by flow |
| Flow-control `POST /issuer/restart` (refused session) | **No.** Auth sits outside the chaos pattern by decision (ADR-0005/0006/0007) and the mock issuer is its own process |
| Flow-control `GET /order-count`, `GET /last-order` (read what the system holds) | **No.** These observe, they do not disturb. They would be replaced by screens or the journal only if the question is "did the fault happen", not "what did the order contain" |
| Web app `x-delay-ms` header (slow response) | **Largely yes**, for slowness below the BFF: `latencyMs` on a layer. The header itself lives in the web app and mock BFF and would remain until the browser suites use a real stack |
| Web app `x-fixture` header (which fixture to serve) | **No.** It selects mock data, not a fault |
| Declined payment (`X-Test-Payment`) | Already replaced by seed data (`WI-ORD-010`); a `payment` layer would add *processor unavailable* and *slow*, which the seed cannot express |

So the layer replaces fault injection in the .NET services and, with the TypeScript layer, at the BFF's door and its service clients. It does not replace process control (a truly stopped process), the issuer, or the observation endpoints.

## 5. Risks and limits

- **Determinism:** only reproducible if decisions are keyed (3.2). Redis redelivery timing is real time and cannot be seeded; tests assert outcomes and counts, not timings.
- **Malformed is shallow at this layer.** It can send an envelope the consumer must reject; it cannot corrupt bytes on the wire. That would need a Redis-level proxy and is out of scope here.
- **Decorator drift:** each wrapper must have a contract-pass-through test (chaos off must pass the shared contract suite), as `ChaosEventTransport` has.
- **Blast radius of a mistake:** a wrong default could degrade a demo silently; the startup banner and health detail (3.5) are there to stop that.
- **Not a load or soak tool.** The 66-minute run of `load-test.mjs` keeps its own role.

## 6. Proposed phases and the decisions needed

1. **Foundation (small):** `ChaosScenario` (JSON, seed), keyed decisions, `ChaosJournal`, `AddBakeryChaos` with the gating, the events and cache layers moved onto it. Tests: determinism under concurrency, journal, gating, contract pass-through. *Needs: approval to add the one line to each service's `Program.cs`.*
2. **Layers:** payment, notification sender, catalog gateway, repository, broadcast, each with a pass-through contract test and a mutation check.
3. **First scenario with evidence:** `flaky-broker-slow-payment` on the real stack (`skeleton-smoke.mjs` journeys plus the order-to-notification path), journal summary committed under `docs/evidence/`. Expected result to *prove*, not assume: no lost order, no duplicate notification sent, the vendor queue converges.
4. **Optional:** a TypeScript layer at the BFF's service clients, so "downstream slow/erroring" can be scripted there too, and a review of whether the flow-control server's remaining endpoints can shrink.

## 7. Decisions (the lead, 2026-11-09)

1. **Composition-root change approved:** one call in each service's `Program.cs` (and the BFF's `main.ts`).
2. **Location:** not in tests. Scenario data in `chaos/scenarios/` at the repository root, so a running local or dev stack can use it; the libraries in `tools/BakeryMarketplace.Chaos` and `packages/chaos`.
3. **Scope:** all services, the BFF, and the Node proxies where they help (phase 4 is folded into the plan below, not optional). `admin-service` is an empty scaffold, so only the wiring call applies there for now.
4. **ADR:** a new ADR (0024, Proposed); ADR-0002 and the other records are adjusted after this settles.

Open point raised by the ADR text: it uses an allow-list (local Development and the dev deployment only) instead of ADR-0002's "not Production"; the lead has not yet confirmed that.

## 8. Phase 1 as built (2026-11-09, local only)

`WI-CHAOS-001`: `chaos/` (scenarios, shared test vectors, README), `tools/BakeryMarketplace.Chaos` (scenario, keyed decisions, journal, gate, the events and cache layers, `AddBakeryChaos`, the response indicator), one line in each of the four services' `Program.cs` plus the cache hook in catalog and notification, 51 library tests, the decorators' tests (including 6 against real Redis), and a real-host test in ordering: an order placed during a broker outage is accepted, the response lists `events:outage`, and the outbox relay delivers the `OrderPlaced` event after the outage ends. The gate accepts Development or `Deployment:Environment=dev`; the dev Terraform now sets both (the .NET services run as Development, `host_environment`, 2026-11-09), so chaos can be enabled there by configuration. Phase 2 followed (section 9). Not built: the TypeScript library, the BFF gate, the equivalence tests per call site, a run against the whole real stack.

### Do the tests and the scenario stay consistent end to end?

The scenario is specified once, by name, in configuration, and the decisions are keyed, so every process that loads the same file and seed makes the same decision for the same operation key. Within one process that holds; across processes it holds only for keys both see (an event id is the same on both sides of the broker; a request key is not). A test therefore names the scenario and asserts from the journal what was injected, rather than assuming. To run the same test with chaos off, with another scenario, or with several, the assertions that hold regardless (an order is never lost, a notification is never sent twice, the queue converges) are written against outcomes; the assertions about the fault itself are written against the journal and are skipped or inverted when the scenario does not contain that fault. Whether a scenario's name travels with a test run (an environment variable set by the runner) is a decision for phase 3.

## 9. Phase 2 as built (2026-11-09, local only)

`WI-CHAOS-002`: the repository layer (`ChaosRepository<T>`, `ChaosBatchFactory`: a Cosmos 503, a conditional save or batch that loses its concurrency check, latency, an outage), the broadcast layer (a failed or lost publish, a lost delivery), and the service-owned layers: `payment` and `catalog` in ordering (`ChaosPaymentProcessor`, `ChaosCatalogGateway`) and `notification` in the notification service (`ChaosNotificationSender`), each registered with one `AddChaosLayer` line. `ChaosPlan` records which layers a process wrapped; a layer the scenario names that a process has no interface for is reported, not an error. Each decorator passes its interface's shared contract suite with chaos off (repository, concurrency, batch, broadcast, sender). In the real ordering host: a declined payment gives 402 and the reservation is released; an unreachable catalog gives 503 `downstream_unavailable` and nothing is stored; a refused reservation gives 409; the same scenario fails the same orders on every run, because the order id comes from the idempotency key. Mutation checks (decline and reject injection disabled) failed the two matching host tests.

What the layers showed about the system (register 170): a payment processor that fails, and a store that fails, are answered by checkout as a bare 500 after the reservation is released, where an unreachable catalog is a 503 with a code the clients handle. Today's behaviour is pinned by tests so a change is deliberate.

## 10. Lost responses and the BFF (2026-11-09, local only)

`WI-CHAOS-003`. **Lost response** (`lostResponseRate`, and `publishLostResponseRate` for events) is now a fault of the repository, payment, catalog-gateway, notification and events layers: the real call is made, then the caller is told it timed out. It showed that an order whose store write is lost is still stored and that a replay with the same idempotency key returns it (idempotency works), that a lost catalog reservation is given back, and two things that do not hold yet (register 171). The **BFF** now has its chaos layers (`packages/chaos`, `services/graphql-bff/src/chaos.ts`): the gate at its door (reject with a chosen status, a non-JSON answer, a reset, no answer, latency, an outage window; `/healthz` untouched) and wrappers on its two service clients. They are switched on by `CHAOS_ENABLED` and `CHAOS_SCENARIO` and gated by `DEPLOYMENT_ENVIRONMENT`. The answer carries `X-Chaos-Scenario`, `X-Chaos-Injected` and `extensions.chaos`. The TypeScript decision function reproduces the shared test vectors, which were computed in Python and are also checked by the C# tests, and a test in each language checks its layer table against `chaos/layers.json`.

The **equivalence** the proposal asked for is tested at two places. At the BFF: an injected 5xx, an injected non-JSON body and an injected "unreachable" give exactly the same GraphQL result (`INTERNAL`, the safe message) as a real 500, a real non-JSON body and a real refused or silent connection (a fake catalog and a refused port are the real faults); a lost response and a retry behave as designed. In the Android app: every way of not getting an answer from the BFF (refused, reset, 503, 429, a page that is not JSON, a GraphQL INTERNAL error, no data, a timeout) makes `gql()` reject, none is taken for a sign-in problem, and none touches the stored session; a 401 is the one different case. Not covered: the web app's Relay environment, and the Maestro flows themselves (flow 07 still stops the BFF; with the gate it can be switched to `bff.rejectRate` when the stack script passes a scenario, phase 3 of the proposal).

## 11. What remains (2026-11-09, end of the session)

Everything in sections 8 to 10 is built, gated and committed on `feature/chaos-event-transport` (not pushed). ADR-0024 is still **Proposed**. In the order I would take it:

1. **Review and push.** The lead reviews ADR-0024 (Proposed), the allow-list gate, the dev Terraform change (the .NET services as Development; register note in ADR-0020) and the 8 commits, then opens the PR. Open question in the ADR: whether the lead accepts the Node gate's reading of `DEPLOYMENT_ENVIRONMENT`.
2. **Whole-stack run with evidence (the old phase 3).** The stack scripts (`skeleton-smoke.mjs`, `mobile-stack.mjs`, `demo.mjs`, `load-test.mjs`) pass one scenario name to every process (`Chaos__*` and `CHAOS_*`); run `checkout-trouble` and `bff-door` on the real stack; commit the journal summary and the result under `docs/evidence/`. Decide how a test run names its scenario (an environment variable set by the runner is the proposal; **decided and built 2026-11-11: `STACK_CHAOS_SCENARIO`, section 15**). The expected result to prove, not assume: no lost order, no duplicate notification sent, the vendor queue converges.
3. **Retire the stop-the-BFF flows.** Flows 07 and 11 stop the BFF through the flow-control server. Switch the ones that only need "the BFF is unavailable" to a scenario (`bff.rejectRate` or `resetRate`) and keep process control only where "connection refused" itself matters (it cannot be injected). The Android equivalence test (`chaos-outcomes.test.ts`) is the justification; check each flow.
4. **The same gate for the Node web servers.** The customer web app and the queue display have server-side proxies to the BFF (`pages/api/graphql.ts`, `proxyGraphql`); the shared package can take the same gate. Add the Relay environment's equivalence test for the web app.
5. **The two behaviours chaos showed (register 170 and 171).** Decide whether checkout maps a failing payment processor or store to the same 503 outcome as an unreachable catalog; write the idempotency-key and void requirements into `PAY-001` and the notification provider's spec.
6. **Smaller gaps.** A layer for the contact directory (not in the original list); the cache layer in the default local backend (nothing is wrapped when `Cache:Backend` is local); the repository layer against the real Cosmos emulator (today the in-memory fake); `GraphQL extensions.chaos` and the indicator on streams (headers only at the start); a Terraform check that no environment other than dev can set `host_environment` to Development without review; the .NET container images would need the `chaos/scenarios` folder if a scenario is to be run by name in them; `docs/testing.md` line 14 and the README headline still say every adapter has a chaos decorator (the lead said to adjust the wording later).
7. **Then amend ADR-0002** (the cache's chaos rules are superseded in part by ADR-0024) and accept ADR-0024 once it has been run on the stack.

## 12. Aimed faults and signals (2026-11-10, local only)

Worked through with the lead after section 11. Item 3 there (retire the stop-the-BFF flows) needed two things the library did not have, and both are now built and tested (TypeScript package, the BFF's wrapper, the C# library's checks; **not yet run on the emulator or the whole stack**).

**What the flows need.** The symptom does not matter: the Android equivalence test shows every failure to get an answer from the BFF (a refusal, a timeout, a 5xx, non-JSON) is handled alike; only a 401 differs. What a scenario could not do was *control*: fail one call at one step and let the next through. A scenario was fixed at process start, with only a time-based outage window.

**What was built.**

- `failFirstAttempts` on `bffCatalog` and `bffOrdering`: the first N attempts of each operation and key fail as an unreachable service does, then the retry goes through.
- A `where` section that limits a layer to the calls that match (operation, customer, key, payload).
- Customer identity from the bearer token's `sub` (read, not verified; approved by the lead on 2026-11-10), because three calls carry nothing else: `listPaymentMethods`, `getPreferences` and `checkCart`.
- `off` and `signals`: a normal request that matches a rule enables or disables a layer, switches scenario or resets the counters. The request carries nothing; the file says what happens. ADR-0024 has the amendment.

**What the flows send (found by reading the code).** The idempotency key is `mobile-` plus 16 random characters per attempt, so it cannot be named in advance, but a retry of the same content reuses it. The order body carries the payment-method id (seed data, one per seeded customer), the lines (service listing ids and quantities) and the allergens told. So the customer can be told from the body for checkout, but Alice is also used by flows 06, 12 and 13, so a rule on her alone would fire in 06 first; the order's contents must be distinctive too.

**Flow 11 (done, not run).** The order is two Oat Milk Lattes (listing `listing-latte-001`) paid with `pm-alice-ok`, which no other flow places. `chaos/scenarios/mobile-flows.json` fails the first attempt of exactly that order. The runner sets the scenario for the BFF it starts (`startServices({ bffChaos })`, used by `mobile-flows.mjs`); nothing in a request can. The BFF stays up and the flow no longer stops it.

**Flow 07 (not done).** It needs the allergy check and the payment methods to fail at checkout and then recover, and the calls involved carry only a token, while flow 05 logs in as the same customer (Nora) and runs first. A rule on Nora alone would fire in flow 05. The way through is a signal: the flow looks at a listing only it opens (a request the catalog client sees), and that request enables the layer; the rule then fails Nora's first calls. **Decided by the lead (2026-11-10, register 173):** add a **new seed listing** for flow 07 (made to order so it never runs out, used by no other flow) instead of searching the flows and the code for something already unique; the request that opens it is unique by construction. Seed tests that count or list listings are updated in the same change. Until then flow 07 keeps its stop and start of the BFF (it also covers the BFF being gone at checkout).

**What stays process control.** Flow 15 (the issuer restarts) and any proof of a real restart (cold start, reconnect): an in-process gate cannot give a process that is gone.

**Limits.** Counters last for the life of the BFF process; the runner starts a fresh one for a full run, and a second run of a flow against the same running stack would not fail the second time (a `reset` signal covers that if it is ever needed). A signal changes the state of the process that sees the request (the BFF); it does not reach ordering or catalog.

## 13. Done on 2026-11-11 (from the lists in sections 11 and 12)

- **Flow 07 on a scenario** (item 3, register 173): the new seed listing `listing-cardamom-latte-001`; opening it makes the BFF switch to `mobile-flows-07`. Tested against the real files in `chaos-calls.test.ts`; **not run on the emulator**.
- **One `Unavailable` outcome** (item 5, register 170): `PaymentUnavailableException` and `StoreUnavailableException` (Data library), mapped by `CheckoutService` to the 503 `downstream_unavailable`. The requirements of register 171 are written into the `PAY-001` entry and `WI-NOT-002` (no code).
- **Auth** (register 176): plain http for the mock issuer only on a local Development host, not on the deployed dev stack.
- **Small gaps:** the .NET image holds `chaos/scenarios`; the dev Terraform refuses `host_environment = "Development"` for an environment that is not dev (`development_is_refused_for_an_environment_that_is_not_dev`, run with the mocked provider); the README and `docs/testing.md` wording. Still open from section 11 item 6: the contact directory layer, the cache layer in the local backend, the repository layer against real Cosmos, `extensions.chaos` on streams.
- **The same gate for the Node web servers** (section 11 item 4, register 177): the door logic moved from the BFF into `runDoor` in `packages/chaos`, and a `web` layer (the `bff` settings) gates the customer app's and the queue display's GraphQL routes through `packages/web-session` (`chaos-door.ts`, one optional `gate` in the two handlers). Tested: the door with fake requests, the handler stopping before the BFF is called, and an **equivalence test over real HTTP** (`chaos-equivalence.test.ts`: a rejected request, an unreachable BFF, a non-JSON body and a reset connection look the same to the client, on status, whether it threw and whether the body parses, as the real fault does). Run by hand against the built customer app (`web-door`): the injected 503 with `X-Chaos-Scenario` and `X-Chaos-Injected`, a 200 `text/html` and a 502 from the proxy for the unreachable BFF. The browser suites and a Playwright run with the scenario are **not run**; the Relay client itself is not exercised (its decision rests on the three facts compared), because its network function is private to the app.

## 14. The small gaps of section 11 item 6, closed (2026-11-11)

- **Contact directory layer:** a `contacts` layer (`failureRate`, `latencyMs`, outage) wraps the contact store under the cache (`IContactStore`, a marker interface so the cache stays above it). Tests: pass-through, a cold cache passes the failure on (the notifier already retries the batch), a warm cache hides the store, no identity in the journal.
- **Cache layer in the local backend: by design, not built.** The cache layer sits under `ResilientCacheProvider` and needs a primary that can fail; the local backend is the in-process fallback itself, with no resilient provider above it. A scenario that names `cache` with `Cache:Backend=local` is reported as not applicable; use `Cache:Backend=redis` (the cache Redis of the Compose `with-redis` profile) to run it.
- **Repository layer against the real Cosmos emulator:** `CosmosChaosTests` (skipped without `COSMOS_CONNECTION_STRING`): a failed write never reaches the store; a lost response leaves the item in the real store and a replay of the create finds it (409, so `SaveIfUnchangedAsync` returns null), which is what the checkout's idempotency relies on. Passed against the vNext emulator: the whole Data suite, 77 of 77 with nothing skipped.
- **A finding while doing it (register 170):** a Cosmos client that cannot connect at all lets an `HttpRequestException` through (no `CosmosException` is made), which the first version of the mapping did not convert. `StoreUnavailableException.IsTransportFailure` now covers it, and `CosmosUnreachableTests` run the real SDK against a closed port (about 20 seconds, because the SDK retries).
- **`extensions.chaos` on streams: by design, not built.** Every fault the BFF injects is injected at the start of a call (the door, the wrappers), so the headers an event stream opens with (`X-Chaos-Scenario`, `X-Chaos-Injected`) already name them; nothing is injected in the middle of a stream by the BFF. A fault in the middle of a stream would come from ordering's `broadcast` layer, which has its own journal.

## 15. How a run names its scenario (2026-11-11)

Decided by the lead: an environment variable set by the runner. `STACK_CHAOS_SCENARIO=<name>` before `skeleton-smoke.mjs`, `demo.mjs`, `load-test.mjs`, `zap-scan.mjs`, `mobile-stack.mjs` or `mobile-demo.mjs` (anything that calls `startServices` and `startWeb` in `scripts/lib/local-stack.mjs`). The runner validates the name (a plain name, a file in `chaos/scenarios/`) before it starts anything and gives it to every process: the .NET services as `Chaos__*`, the BFF, the customer app and the queue display as `CHAOS_*` with `DEPLOYMENT_ENVIRONMENT=local`. The test process inherits the variable, so a test knows the scenario it runs under (the proposal's rule that the tester knows the scenario) and reads the journal; it cannot choose one by a request. Not supported with `--containers` (the Compose services take no scenario) or with `mobile-flows.mjs` (it names `mobile-flows` for the BFF itself and refuses a second one). Tested by `scripts/ci/tests/stack-chaos.test.mjs` (the name checks and the settings each kind of process gets); **no whole-stack run with a scenario has been made yet**, which is the evidence run of section 11 item 2.

## 16. Chaos specs per scenario (2026-11-11)

Decided with the lead: the existing suite runs with no scenario and is never changed by a scenario; chaos specs are separate and **additive**, one file per scenario in `apps/web-customer/tests/chaos/<scenario>.spec.ts`, run by `node scripts/ci/chaos-smoke.mjs <scenario>` (it sets the scenario, starts the notification service as well, runs only that spec, then checks the services' logs once they have stopped: the faults the scenario names were injected, no event notified twice, every confirmed order notified; writes `artifacts/chaos/<scenario>/summary.json`). A spec asserts invariants and only about the data it created; metrics are recovery and resilience figures only (retries needed, time to converge, orders lost, duplicates), never latency. A known gap is pinned by an expected-failure test (`test.fail`) or reported as a known gap in the summary, so a fix shows up.

Done and run on the whole stack: `checkout-trouble`, `lost-confirmation` (new scenario: the work done, the answer lost), `flaky-broker`, `broker-outage`, `bff-door`, `web-door`. Found and fixed: register 179, 180, 181, 182. Found and open: 183 (built, evidence pending: a notification handler that keeps failing is redelivered with a back-off, 6 deliveries), 171 (payment authorized twice; notification sent twice).

**Register 182 and 183 (the lead's decision: retry with back-off, never park on a transport failure).** The event adapters raise `EventTransportException` for an unreachable or slow broker; an outbox counts and parks only failures retrying cannot fix, and its relay backs off while sweeps send nothing. `broker-outage` then ends with 45 of 45 confirmed orders in the vendor queue and notified (before: 34, 11 parked). The Redis transport redelivers after the redeliver time doubled per earlier failure and dead-letters after 6 deliveries (was 3).

**`bff-door` and `web-door`.** The BFF spec runs the shared checkout invariants through the BFF door and its service calls (30 orders), reads the listings 40 times (every failure is a plain failure with a correlation id, never a quiet wrong answer, and a retrying client always gets the data), retries a `placeOrder` with the same key (15 orders, one order each), and loads the order history in the browser 16 times (it shows "could not load" with a Try again button, never a blank page or a stuck spinner, and Try again recovers; 5 of 15 reloads needed it). The web spec does the same for the web server's own GraphQL route (2 of 15 reloads needed Try again). Both prove the faults happened from the responses' `X-Chaos-Injected` header and the BFF's JSON journal lines (the web servers log none); a single page load is too small a sample, so that proof comes from the reload loops.

**Not done yet:** `slow-cache` (listings correct with the cache failing, cart and order data never stale, `no-store` kept); the lead's later review of test design (register 178).
