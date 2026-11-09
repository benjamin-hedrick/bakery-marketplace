# Chaos scenarios: proposal and assessment

> **Status: proposal for the lead's decision (2026-11-09). Nothing here is built except what the "Where we are" section says is built.** It touches the services' composition roots (`Program.cs`), so it needs approval before any work (CLAUDE.md, "Human approval required"). If accepted it becomes a work item and, for the config and gating rules, an ADR (next number 0024).

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

## 4. What this replaces, and what it does not

Honest mapping against the mechanisms listed in register 150 and 155:

| Mechanism today | Replaced by a scenario? |
|---|---|
| Flow-control `POST /bff/stop` and `/bff/start` (BFF unreachable) | **No.** The BFF is Node; a .NET decorator cannot touch it. A scenario can cover "ordering/catalog unavailable" below it, but "BFF down" stays process control. A TypeScript twin of the layer at the BFF's service clients is possible and is a separate decision |
| Flow-control `POST /issuer/restart` (refused session) | **No.** Auth sits outside the chaos pattern by decision (ADR-0005/0006/0007) and the mock issuer is its own process |
| Flow-control `GET /order-count`, `GET /last-order` (read what the system holds) | **No.** These observe, they do not disturb. They would be replaced by screens or the journal only if the question is "did the fault happen", not "what did the order contain" |
| Web app `x-delay-ms` header (slow response) | **Largely yes**, for slowness below the BFF: `latencyMs` on a layer. The header itself lives in the web app and mock BFF and would remain until the browser suites use a real stack |
| Web app `x-fixture` header (which fixture to serve) | **No.** It selects mock data, not a fault |
| Declined payment (`X-Test-Payment`) | Already replaced by seed data (`WI-ORD-010`); a `payment` layer would add *processor unavailable* and *slow*, which the seed cannot express |

So the layer replaces **fault injection below the BFF in the .NET services**. It does not replace process control, the issuer, or the observation endpoints. Section 6 asks whether to extend it to the BFF.

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

**Decisions for the lead**
1. Approve the composition-root change (3.4), or require chaos to be wired only in separate test hosts.
2. Is a committed scenario file under `scenarios/` acceptable, or should scenarios live only in test projects?
3. Extend to the BFF in phase 4 (a second implementation language), or stop at the .NET services?
4. Is a new ADR (0024) wanted for the config, gating and journal rules, or an amendment to ADR-0002?
