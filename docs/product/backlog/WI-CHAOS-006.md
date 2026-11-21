> **Status:** In progress · built: the observe step counts the scenarios started and the faults injected (`dev-observe.mjs`); the full plan below waits for the lead's agreement before any other piece is built (the lead, 2026-11-21: agree the whole plan first, then build in steps)

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

- `dev-observe.mjs` counts, per app, the scenarios that started (`chaosScenariosOn`) and the faults injected by layer and fault (`chaosInjected`), counts only. Run against the dev workspace on 2026-11-21: both read, 0 rows.

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
