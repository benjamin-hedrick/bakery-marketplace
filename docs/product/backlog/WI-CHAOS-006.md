> **Status:** In progress · built: the observe step counts the scenarios switched on and the faults injected (`dev-observe.mjs`); remaining: the lead's answers to the questions below, then the chaos stage, its script, the web app's environment name, and the deployed chaos specs

```
WI ID:               CHAOS-006
Title:                Chaos scenarios in the deployed dev environment: a pipeline input, a chaos stage that switches a scenario on and off, deployed specs
Type:                 Test/Mock/Chaos
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  EPIC-CLOUD-INFRA
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 M
```

> Started 2026-11-21 at the lead's request: work toward chaos in the deployed dev environment, with the scenario chosen as a pipeline input, while dev stays up. It closes register 218 (4) and the last piece of register item 169 (a scenario switched on in the deployed dev stack). ADR-0024 already allows dev (decision 6); this item adds no new kind of fault.

**Context / Why**

The scenarios run on the whole local stack (`scripts/ci/chaos-smoke.mjs`, evidence in `docs/evidence/WI-CHAOS-003/`). The images already carry `chaos/scenarios/` and the code that reads them, and the dev stack's .NET services run as Development with `Deployment__Environment = dev`, so a scenario would start there. What is missing (register 218 (4), 2026-11-20):

1. **A way to name a scenario for a run.** A scenario is chosen once per process, at start-up, from its environment, so a Terraform variable would keep it on until the next apply. Proposed then and kept here: the run switches it on in a new revision and off again in the same run.
2. **The web app's `DEPLOYMENT_ENVIRONMENT = dev`.** It is set on the BFF, not on the web app; a `web` or `session` scenario would make the web app refuse to start.
3. **Specs that use only the public addresses.** The local specs call the BFF and catalog directly, read the journal from the local log files and expect the issuer at `localhost:5100`; none of that exists in a deployed environment.
4. **Evidence from the environment's log.** Built 2026-11-21: `dev-observe.mjs` now counts, per app, the scenarios that started (`chaosScenariosOn`, from the `CHAOS SCENARIO '<name>' IS ON` line both languages write) and the faults injected by layer and fault (`chaosInjected`, from both journals' `chaos injected` lines). Counts only; the key and trace id on those lines are not kept. Run against the dev workspace on 2026-11-21: both queries read, 0 rows (no scenario has run there).

**Proposal**

1. **A pipeline input `chaosScenario`** in the dev pipeline only: `none` (the default) or one name from a fixed list in the pipeline file, which holds only scenarios that have a deployed spec. The UAT pipeline does not have it, and the template refuses it for any environment but dev.
2. **A new action `chaos`** next to `deploy` and `destroy`: it runs only the chaos stage and the observe stage against what is deployed, so a scenario can be repeated without a deploy. With `deploy` and a scenario, the chaos stage runs after the normal smoke, so the normal suite always runs first with no scenario (the rule of `docs/evidence/WI-CHAOS-003/`: existing tests run with no scenario; chaos specs are separate and additive).
3. **The chaos stage** (a deployment job on `dev-app`, so it has its own approval; the deploy identity):
   a. `scripts/ci/dev-chaos.mjs on --scenario <name>`: refuses any group but `rg-bakery-dev` and any environment but `dev`; sets `Chaos__Enabled`/`Chaos__Scenario` (catalog, ordering) and `CHAOS_ENABLED`/`CHAOS_SCENARIO` (BFF, web) in a new revision of each app, the same image digest as now; waits until each new revision is running; records the revisions.
   b. The warm-up, then the scenario's deployed spec (`apps/web-customer/tests/deployed-chaos/<scenario>.spec.ts`, public addresses only).
   c. `scripts/ci/dev-chaos.mjs off`, in a step that runs whether the spec passed or failed: removes the four settings in a new revision of each app and checks they are gone. The application deploy (`dev-deploy.mjs`) also removes them, so a run that died before `off` is cleaned up by the next deploy.
   d. The observe stage, which now reports the scenarios that started and the faults injected.
4. **The web app's `DEPLOYMENT_ENVIRONMENT = "dev"`** in the dev stack (one Terraform line, through `var.environment`; an infrastructure change with its approval).
5. **Deployed chaos specs**, one per scenario, first wave: `bff-door` (the BFF's door: delays and refusals), `checkout-trouble` (payment declines and lost answers, the catalog gateway, the repository), `catalog-outage`. Each spec first shows the scenario is on (`X-Chaos-Scenario` on the responses it gets, and `X-Chaos-Injected` naming the faults it caused), then asserts what the customer sees and that the system recovered, and records recovery figures, not latency. The log's counts from the observe stage are the run's journal evidence.
6. **The guard test changes** (`scripts/ci/tests/chaos-not-deployed.test.mjs`): "the pull-request and dev pipelines do not switch chaos on" becomes "only the dev pipeline names chaos, only in its chaos stage, only through `dev-chaos.mjs` and the `chaosScenario` input with the default `none`"; the services' and the Node processes' own start-up gates are unchanged and still refuse chaos outside dev.

**What this does not change**

- No fault type, layer or scenario file changes. The C# library still only checks `where`, `off` and `signals` and does not apply them (register 218 (4)), so a C# layer disturbs every call at its rate while the scenario is on; the chaos stage is the only traffic then, apart from anyone using dev at that moment.
- Terraform owns the apps' configuration; the chaos settings live only between `on` and `off` of one run. The plans read the state with `-refresh=false` (register 213), so a scenario left on would not show in a plan; the next deploy removes it.

**Questions for the lead**

1. Approve the guard test's change in step 6 (it encodes a safety rule).
2. A separate approval for the chaos stage (`dev-app` again), or none beyond the run's own (it changes only settings that the same run removes)?
3. The first wave of three scenarios in step 5, or others first? (Scenarios on layers dev does not deploy, notification, and the Android flows' two, are left out.)
4. ADR-0024 decision 8 says a scenario test asserts the journal shows the fault before it asserts the system coped. A deployed spec cannot read the log; the proposal uses the `X-Chaos-Injected` response header in the test and the log's counts in the observe stage as the journal evidence. Accept that reading for deployed runs?

**Requirements / Acceptance Criteria**

- A dev run with `chaosScenario` set runs the normal smoke first with no scenario, then the scenario's spec, and ends with no chaos setting on any app (checked by `off` and by the observe stage's start lines).
- A run with `chaosScenario: none` changes nothing that build 88 did.
- The UAT pipeline cannot name a scenario, and `dev-chaos.mjs` refuses any other group or environment (tests).
- Each first-wave scenario's spec passes in dev, with the observe stage's counts as evidence under `docs/evidence/WI-CHAOS-006/`.

**Dependencies**

- Builds on: `WI-DEP-001` (the dev environment), ADR-0024, `WI-CHAOS-003` (the local scenarios and specs).
- The pipeline input and stage are written into the template of `WI-DEP-002` step 2b if that refactor goes first; otherwise into `azure-pipelines-dev.yml` and moved with it.

**Inputs / References**

- ADR-0024; register items 169, 213, 218, 228; `chaos/README.md`; `scripts/ci/chaos-smoke.mjs`; `apps/web-customer/tests/chaos/`.
