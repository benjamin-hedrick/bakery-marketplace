> **Status:** In progress · the lead agreed the whole plan and the request-sequence triggers (2026-11-21). Built: the observe step's chaos counts, and step 2 (the C# library applies `where`, `off` and `signals`, with shared vectors). Remaining: the lead's decisions on the four design findings below, then steps 1, 3 to 7

```
WI ID:               CHAOS-006
Title:                Chaos in the deployed dev environment: one scenario, aimed at chaos seed data, switched on per deployment, exercised by the standard suite
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-CLOUD-INFRA
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 L
```

> Started 2026-11-21 at the lead's request; reshaped the same day by the lead's goal: **one scenario (`dev-chaos`) switched on for a whole dev deployment, whose faults are aimed at chaos seed data and triggered by particular requests, so that one standard suite, unchanged, runs against dev (where it meets chaos) and UAT (where it does not), in parallel if wanted.** It closes register 218 (4) and the last piece of register 169. Controlled chaos is part of the design (ADR-0024), not test-only code: nothing here adds a hook, endpoint or flag for tests.

**Where a scenario lives, and how it is switched on (today)**

- **The scenario** is a JSON file in `chaos/scenarios/`, copied into every image at build, so dev and UAT run the same digest with the same files. In UAT the files are inert: nothing switches them on, and the processes refuse chaos there anyway.
- **Switching on** is per process, at start-up, from its environment: `Chaos__Enabled` and `Chaos__Scenario` (catalog, ordering), `CHAOS_ENABLED` and `CHAOS_SCENARIO` (BFF, web). The gate refuses it unless the environment is `dev` or local (`Deployment__Environment`, `DEPLOYMENT_ENVIRONMENT`), so a process with chaos settings in UAT does not start.
- **Using it:** each process wraps the interfaces it already has (the composition root only; ADR-0024 decision 5) with the scenario's layers: in the services the event transport, cache, repository, payment processor, catalog gateway and broadcast; in the BFF its door and its two service clients; in the web app its GraphQL routes and its session store. Each call is judged by the keyed decision function (seed, layer, fault, the call's own key), so the same calls are hit on every run.
- **Aiming:** a scenario's `where` limits a layer to calls that match an operation, a customer (the token's `sub`), a key (an id) or a payload pattern; `off` starts a layer switched off; `signals` let a normal request that matches switch a layer on or off, switch to another scenario, or reset. **Today only the Node processes apply these; the C# library validates them and then disturbs every call at the layer's rate** (register 218 (4)). That is the main gap.
- **What a response says:** `X-Chaos-Scenario` on every response while a scenario is on, and `X-Chaos-Injected` naming the faults injected while producing that response (`extensions.chaos` in GraphQL). The web app passes both through to the browser. Each process also logs every injected fault (the journal), which the observe step now counts.

**The plan**

1. **One dev scenario, `dev-chaos`**, with many layers, every one of them aimed by `where` at chaos seed data only: chaos customers, chaos listings, a chaos payment method, a chaos vendor. Regular seed data is never matched, so the regular tests are untouched even while the scenario is on and even when tests run in parallel. Triggers are `signals` on particular requests (for example: a read of the chaos listing `listing-chaos-outage` switches the catalog outage layer on, and a read of `listing-chaos-recover` switches it off), so a test makes a fault happen by a request sequence, not by a setting. Each chaos test owns its chaos seed data point, so two chaos tests running at once do not disturb each other. First faults in it: the BFF's door (delays and refusals on chosen requests, keyed by the test's own `traceparent`), checkout (a declined and a lost payment answer for the chaos payment method, a catalog gateway failure for a chaos listing), and a triggered catalog outage. More are added to the same file later, each with its own seed data point.
2. **The C# library applies `where`, `off` and `signals`** as the Node library does: the same matching rules, with shared test vectors in `chaos/` that both libraries' tests reproduce (as the decision function's are). The services' layers already give the runtime the call's operation and key; payload and customer are added where a layer has them. A signal is applied in the process that sees the matching call: a trigger aimed at a catalog fault is a request that reaches catalog.
3. **Chaos seed data** in `tools/BakeryMarketplace.Seed`: named data points for chaos (customers on the mock issuer, listings, a payment method, a vendor), seeded in dev and in UAT alike, so the same tests find the same data in both. Existing seed tests updated for the new points.
4. **The standard deployed suite gets chaos-aware tests, written once:** a test uses its chaos data point, and asserts an outcome that must hold whether or not a fault came: an order confirmed, or refused with the right message, never charged twice, never lost. It reads `X-Chaos-Scenario` and `X-Chaos-Injected` from the responses it gets, and **when the environment says a scenario is on, it fails unless the fault it aimed at was injected** (so a dev pass cannot be a run with chaos silently off; ADR-0024 decision 8, the header standing in for the journal in a deployed run, as the lead agreed). Where no scenario is on (UAT), the same test checks the plain path. The test records which it saw, so a run's evidence lists per test "fault injected: yes/no". The regular tests do not change.
5. **Switching it on for a deployment:** the dev pipeline input `chaosScenario` (`none` by default, or `dev-chaos`) is a Terraform variable of the environment module, applied with the infrastructure approval; it sets the four chaos settings on the four apps. The module refuses a scenario unless `environment == "dev"`, and only the dev root passes the variable; the guard test (`chaos-not-deployed.test.mjs`) changes to allow exactly that and nothing else, as the lead approved. The scenario then lives as long as the deployment, until a run changes it. The web app also gets `DEPLOYMENT_ENVIRONMENT = var.environment`. No extra approval stage (the lead: the explicit input is the enable).
   - Why a Terraform variable, not a change to the running revision as proposed on 2026-11-20: then the aim was one scenario for a few minutes, switched off in the same run; now a scenario lives with the deployment, and a variable puts it in the plan the lead approves. An apply that changes an app puts it back on the placeholder image until the application deploy of the same run (register 217), so `chaosScenario` is honoured by `deploy` runs, not by an infrastructure-only change.
6. **Local first:** the same suite runs against the local stack started with `dev-chaos` (`skeleton-smoke.mjs` already takes `STACK_CHAOS_SCENARIO`), so each new fault is tried locally before it is deployed.
7. **Observe and evidence:** the observe stage's counts (scenarios started, faults per layer and fault) plus the suite's per-test "fault injected" list, under `docs/evidence/WI-CHAOS-006/`, from a dev run with `dev-chaos` and a UAT run of the same build without it.

**Built so far**

- Step 2 (2026-11-21): the C# library applies `where`, `off` and `signals` (`ChaosRuntime.Signal`, `ChaosLayer.Disturbs`, `ChaosMatching`); every C# layer asks `Disturbs` first and passes a call it is not aimed at straight through. `chaos/match-vectors.json` holds the shared cases (payload patterns, rules against calls, and two runs of signals); the Node and C# suites both reproduce them. The key and payload a rule sees per layer are in `chaos/README.md`; ADR-0024 has a dated note. Tests: the chaos library 79 of 79 (all earlier tests unchanged), the Node chaos package 71 of 71, ordering 551, catalog 411, notification 64 passed (Redis and Cosmos tests skipped without their containers).
- `dev-observe.mjs` counts, per app, the scenarios that started (`chaosScenariosOn`) and the faults injected by layer and fault (`chaosInjected`), counts only. Run against the dev workspace on 2026-11-21: both read, 0 rows.

**Design findings, 2026-11-21 (while making the first wave concrete; for the lead's decision before the seed data and the scenario are built)**

1. **A service's faults are not visible to the browser.** ADR-0024 decision 10: "A service's own faults are reported by that service; the BFF does not copy them to the client." So a browser test sees `X-Chaos-Injected` for the BFF's and the web app's own layers only; a payment, catalog-gateway or repository fault in ordering or catalog never reaches it, and a chaos-aware test could not fail itself when its fault did not happen. Faults in event handlers happen after the response in any case. **Proposed:** (a) a dated note on ADR-0024 so the BFF copies a service's `X-Chaos-Injected` into its own, each name prefixed with the service (`ordering/payment:lostResponse`), and the web app passes it on, as it already passes the BFF's; composition only, no rule. (b) For faults with no response to carry them (events), the observe stage checks the journal in the environment's log by each chaos test's trace id (the C# journal line carries it) and fails when an expected fault is missing.
2. **The doors (`bff`, `web`) are not aimed.** They apply `latencyMs`, the outage window and the rates to every request; `where` is not applied at a door, so a door fault in `dev-chaos` would reach the regular tests. **Proposed:** the door applies `where` too, matching the request's own trace id as the key (a test that wants a door fault sends its own `traceparent`, the W3C header every client may send, ADR-0016) and, at the BFF, the customer from the bearer token.
3. **One fault profile per layer.** A layer's settings apply to every call its `where` matches, so within one scenario two chaos data points cannot get two different faults from the same layer. The first wave fits (each fault on its own layer), and `dev-chaos` can hold one aimed profile on each of the thirteen layers. **Proposed:** start within this; if a second profile on one layer is needed later, per-rule settings in `where` is a format change in both libraries and an ADR note.
4. **Chaos seed data is visible.** A chaos vendor and its listings appear on the home page and in search, in dev and UAT alike. **Proposed:** a vendor named "Chaos Test Bakery" and listings that say "(chaos test)", visible; hiding them from browsing would be a product rule (a new kind of listing), not seed data.

**The first wave, concretely (proposed)**

| Layer (process) | Aimed at (new seed data) | Fault | Trigger | What a test asserts, in dev and in UAT |
|---|---|---|---|---|
| `payment` (ordering) | the payment method `pm-chaos-lost` of a new chaos customer | `lostResponseRate` 1: the authorization is made, the answer is lost | always on | the order ends confirmed or refused, exactly once; never two authorizations; a refused order's authorization is voided |
| `catalog` (ordering's gateway) | `reserve` of an order whose one line is `listing-chaos-reserve-001` | `rejectRate` 1: the stock check says no | always on | the order is refused for stock, and the listing's stock is unchanged |
| `bffCatalog` (BFF) | the listing `listing-chaos-outage-001` | `unavailableRate` 1, the layer off at start | reading `listing-chaos-outage-on` switches it on, reading `listing-chaos-outage-off` switches it off | the listing page says it is not available just now while on, and shows the listing again after off |
| `bff` door (BFF) | the test's own trace id (finding 2) | `latencyMs` 2000 | always on | the page waits, then loads; nothing else is slowed |

**Order of building, after agreement**

The C# aiming (2, with its vectors) and the seed points (3) first, tried locally with a first `dev-chaos` (1) and the first chaos-aware tests (4) on the local stack (6); then the module variable, the web app's environment name and the guard test (5), which go with `WI-DEP-002` step 2's refactors; then a dev deploy with `dev-chaos` and a UAT run of the same build (7).

**What this does not change**

- No fault type is added and no layer changes what it injects; the existing scenario files and their local specs stay as they are.
- Authentication, secrets and payment integration stay outside chaos (ADR-0024 decision 11).

**Questions for the lead**

1. Agree the plan above as the whole, before steps 2 to 7 are built.
2. The triggers as request sequences on chaos seed data (a read of a named chaos listing switches a fault on, another switches it off), rather than timed windows. Agree?

**Requirements / Acceptance Criteria**

- With `dev-chaos` on, the regular tests pass unchanged, in parallel with the chaos-aware tests.
- Each chaos-aware test passes in dev with its fault injected (the header shows it) and in UAT with none, and fails in dev if its fault was not injected.
- The C# and Node libraries reproduce the same shared aiming vectors.
- The UAT pipeline cannot name a scenario; the module refuses one outside dev (tests).
- Evidence of a dev run with `dev-chaos` and a UAT run of the same build under `docs/evidence/WI-CHAOS-006/`.

**Dependencies**

- Builds on: `WI-DEP-001`, ADR-0024 (and its 2026-11-10 amendment on aiming), `WI-CHAOS-003`.
- Step 5 goes with `WI-DEP-002` step 2 (the module and the stage template).

**Inputs / References**

- ADR-0024; `chaos/README.md` (aiming and signals); register items 169, 213, 217, 218, 228.
