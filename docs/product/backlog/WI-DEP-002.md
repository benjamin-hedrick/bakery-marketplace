> **Status:** In progress · every decision taken (2026-11-21); step 2 built (2a proved against the dev state, 2b by equivalence; neither run by the pipeline yet); remaining: steps 1 and 3 to 9

> **Progress note (2026-11-21):** step 2a built: the dev resources are in `infra/modules/environment`, the dev root calls it with `moved` blocks, and a read-only plan against the dev state shows 27 moves and nothing else (`docs/evidence/WI-DEP-002/module-refactor-2026-11-21.md`). Found on the way: `plan-summary.mjs` would have refused a moves-only plan; fixed. Step 2b built the same day: the stages are in `pipelines/templates/environment-stages.yml` and the dev file passes its connections and approval environments; substituting them back gives the original stages byte for byte.

```
WI ID:               DEP-002
Title:                A UAT environment next to DEV: deployed on demand, promoted from a passing DEV run, torn down like DEV
Type:                 Document/Artifact
Epic:                 EPIC-CLOUD-INFRA
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 M
```

> Written 2026-11-21 at the lead's request (register 229). The lead wants a UAT environment deployed next to DEV, mainly so the same tests can run side by side in two deployed environments, and expects small additive changes because ADR-0020 decision 9 designed UAT in from the start. This spec says what of that design is already in the code, what is not, the lead's decisions, and the steps. Nothing here is built.

**Context / Why**

ADR-0020 decision 9 designed UAT and Prod as a second pipeline over the same templates, an environment root per folder validated on every pull request, and promotion of the same image digest after a recorded passing smoke in the environment before it. It also said UAT and Prod would be reviewed and never run; the lead now wants UAT run, on demand.

**What of the design is already in the code (no change needed)**

- `scripts/ci/dev-stack-env.sh` takes the environment as an argument, initialises `infra/environments/<environment>` with the state key `<environment>.tfstate`, and reads that environment's apps identity from the foundation's `app_identities` map.
- The dev stack's names come from `var.environment`; the resource group, vault, Cosmos names and both locations are variables; the budget is per environment.
- `host_environment` refuses `Development` for any environment but `dev`, so a UAT root runs as `Staging` or `Production`; chaos scenarios are refused outside dev (ADR-0024).
- The pipeline's steps read `ENVIRONMENT_NAME` and `RESOURCE_GROUP`; the identity check, the destroy guard and the teardown's emptiness check take the environment and group as arguments.
- The foundation's `app_identities` is a list, so a UAT apps identity with AcrPull is one more entry.
- The deployed suite, the warm-up, the latency run and the observe step take the public addresses and the group as arguments.

**What is not (the difference)**

1. **The Terraform is one root, not shared code.** `infra/environments/dev` holds every resource directly (about 680 lines).
2. **The pipeline is one file, not templates.** `azure-pipelines-dev.yml` (578 lines) holds every stage; only the Terraform install is a template. There is no promote pipeline and no check of a previous environment's smoke.
3. **The seed and the mock issuer are switched on by settings named for dev** (`Seed:AllowDeployedDev`, `MockOidc:AllowDeployedDev`), and the seed accepts only `Deployment:Environment = dev`.
4. **The identities and the state container are dev's.** `bakery-deploy` is scoped to `rg-bakery-dev` and the foundation group, with Storage Blob Data Contributor on the one `tfstate` container.
5. **ADR-0020 says promotion imports the digest into that environment's registry.** There is one registry, in the foundation.
6. **The subscription allows one Container Apps environment per region** (Free Trial offer, spending limit on; read 2026-11-21: East US 1 of 1 used by dev, East US 2 0 of 1). UAT's environment therefore goes in East US 2, where dev's Cosmos account already is. A second Cosmos account (not on the free tier) is within the account limit; whether East US 2 has capacity for it is known only when it is created (East US refused dev's for "high demand").

**Decided by the lead (2026-11-21)**

- Step 2's two refactors are approved (decision 2).
- UAT has its own state container (decision 3).
- Seeding UAT is an option chosen per run (decision 4).
- The mock issuer is extended to UAT, only so the same tests can run side by side in two deployed environments, and switched on per run (decision 5).
- One subscription and one account: UAT goes in the same subscription, its environment in East US 2 (decision 6, from the quota above; the credits are left aside).
- DEV stays up while the dev chaos work goes on (`WI-CHAOS-006`); UAT is created later (decision 7).
- Run options become pipeline inputs where they can (below).

**Run options as pipeline inputs**

The pipeline already takes `action` (deploy or destroy) and `planMode` (real or rehearsal). The proposal adds inputs of two kinds, so each lands where it is reviewed:

| Input | Kind | Dev | UAT | How it is applied |
|---|---|---|---|---|
| `seed` | run | default on | default off | the application deploy runs the seed job, or skips it |
| `mockIssuer` | infrastructure | always on (dev's only issuer) | default off; on for a side-by-side run | a Terraform variable: the mock issuer app and the services' issuer settings exist only when on, so turning it on or off is a plan change behind the infrastructure approval |
| `issuerRoles`, `issuerAllowedIps` | infrastructure | Customer only, no list | the same | Terraform variables (the existing `issuer_roles` and `allowed_ips`); Vendor or Admin logins need an allow-list, as the issuer's guard already requires |
| `chaosScenario` | infrastructure | `none` (default) or `dev-chaos` | not offered | dev only: a Terraform variable the module refuses outside dev; the scenario lives as long as the deployment, and the standard suite runs against it unchanged (`WI-CHAOS-006`) |
| `devBuild` | run | not offered | the dev build to promote | refuses a build whose smoke did not pass |

An infrastructure input is passed to the plan and to the re-plan after approval the same way, so the approved plan is the applied plan (ADR-0020 decision 6). A run input is recorded in the deployment record. Neither kind can name a value outside the list the pipeline file allows.

**Steps, in order (each step small, each one a commit)**

1. **ADR-0020, a dated note** (the decision text is not edited): UAT is deployed on demand with the same gates, created and torn down like dev; Prod stays designed only. UAT uses the foundation's registry (the same digest, nothing imported); a Prod registry of its own stays the design for Prod. UAT may run the mock issuer, only when a run asks for it, until Entra (register 222).
2. **Refactors, no behaviour change, proved before UAT exists:**
   a. The dev root's resources move into `infra/modules/environment`. `infra/environments/dev` keeps its backend, provider and variable file and calls the module, with `moved` blocks so the state keeps every resource. `chaos-not-deployed.test.mjs` is changed to match: the module may name the chaos and deployment-environment settings only through `var.environment`, and no root but dev may set `environment = "dev"`. Proof: `terraform-checks.mjs` passes, and a plan against the dev state shows no changes (read only, from the lead's machine).
   b. The pipeline's stages move into `pipelines/templates/environment-stages.yml`, with parameters for the environment, the group, the approval environments, the connection ids, whether the run builds or promotes images, and the inputs above. `azure-pipelines-dev.yml` calls it with today's values. Proof: `pipeline-structure.test.mjs` checks the same things, and the next dev run behaves as build 88 did.
3. **The inputs** of the table above, in the template, the module and the scripts, defaulting to what dev does today.
4. **Settings named for deployed environments, not for dev** (the lead's approval; auth): `Seed:AllowDeployed` and `MockOidc:AllowDeployed` replace the `...Dev` names, and both accept only `Deployment:Environment` of `dev` or `uat`, never anything else. The mock issuer keeps every other limit (https issuer, Customer only unless an allow-list). Tests in the seed and auth projects.
5. **`infra/environments/uat`**: a thin root calling the module with `environment = "uat"`, `resource_group_name = "rg-bakery-uat"`, `location = "eastus2"`, `host_environment = "Production"`, `cosmos_free_tier = false`, its own vault and Cosmos names and budget, and the `tfstate-uat` container; `uat.tfvars.example`. `terraform-checks.mjs` validates it.
6. **Foundation:** `app_identities = ["dev", "uat"]` (one more apps identity with AcrPull). Applied from the lead's machine after the plan is shown, as on 2026-11-20.
7. **Bootstrap for UAT (the lead, in Azure and Azure DevOps; IAM):** the group `rg-bakery-uat`; the container `tfstate-uat`; a deploy connection `bakery-uat-deploy` with `bakery-deploy`'s roles moved to `rg-bakery-uat` (Contributor; RBAC Administrator limited by condition to the two Key Vault roles; Storage Blob Data Contributor on `tfstate-uat` only; the foundation's outputs as pipeline variables rather than a read of the `tfstate` container, which also holds dev's state and so dev's Cosmos keys, register 214); `bakery-plan` reused (Reader on the subscription covers UAT; Storage Blob Data Reader added on `tfstate-uat`); approval environments `uat-infra`, `uat-app`, `uat-destroy` with an approval, branch control (`main` only) and an exclusive lock; the pipeline variables. Recorded like `bootstrap-2026-11-19.md`.
8. **`azure-pipelines-uat.yml`** (`trigger: none`, `pr: none`): the template in promote mode. It takes `devBuild`, refuses unless that run's smoke stage succeeded, and deploys that run's recorded digests: no image is built for UAT.
9. **Runbooks and evidence:** the teardown runbook names UAT; the first UAT run, a side-by-side run of the deployed suite against both, and the UAT teardown are recorded under `docs/evidence/WI-DEP-002/`.

**Cost (while UAT is up)**

The same shape as dev (`docs/management/budget-cost-estimate.md`): three Redis apps always on, the other apps scaled to zero, Key Vault and Log Analytics at small usage, plus a Cosmos account off the free tier at 400 RU/s shared (about 0.03 USD an hour, 0.77 a day). The Container Apps monthly free grant is per subscription, so two environments use it about twice as fast. The registry is shared. A budget alert per environment. On a Free Trial with the spending limit on, Azure disables the subscription's resources when the credit runs out or the trial ends; the trial's end date is on the subscription's page in the portal.

**Out of scope**

- Deploying Prod (designed only); chaos in UAT (refused by design); Entra External ID (register 222); the vendor app (register 219); the Android app against a deployed environment (register 220).

**Requirements / Acceptance Criteria**

- A dev plan after step 2a shows no changes, and a dev run after step 2b behaves as build 88 did.
- A UAT run promotes a dev build whose smoke passed, refuses one whose smoke failed or is missing, and builds no image.
- A UAT run without `mockIssuer` has no mock issuer; with it, the deployed suite passes in UAT and in dev in the same session (the side-by-side run).
- UAT's smoke (with the warm-up) and observe stages pass, and their evidence is recorded.
- A UAT teardown leaves `rg-bakery-uat` empty, and the foundation, the state account and dev untouched.
- Anything found while doing it and not fixed is recorded in the register in the same change.

**Answered by the lead (2026-11-21, later)**

1. The ADR-0020 note of step 1: approved as worded.
2. UAT's `mockIssuer` defaults to off; a run may switch it on, which UAT could not do before, so two deployed environments can be tested side by side sooner.
3. The two settings are renamed and widened to `uat` (step 4): approved.
4. UAT runs the services as Production, as part of what UAT tests: approved.
5. The foundation's outputs reach UAT as pipeline variables, not through the `tfstate` container: approved, on the condition that no secret is exposed or logged. The outputs are a registry login server and an identity's resource id and principal id, none of them a secret; they are still set as plain pipeline variables (not printed by any step), and `dev-stack-env.sh` prints nothing but Terraform's own init output.

**Dependencies**

- Blocked by: none.
- Builds on: `WI-DEP-001` (build 88, `docs/evidence/WI-DEP-001/first-full-dev-deploy-2026-11-21.md`). Shares the template work of step 2b with `WI-CHAOS-006`.

**Inputs / References**

- ADR-0020 (decision 9 and its notes), ADR-0007, ADR-0024; register items 216, 222, 224, 228, 229.
- `docs/evidence/WI-DEP-001/bootstrap-2026-11-19.md` (the roles UAT copies), `docs/operations/runbooks/dev-environment-teardown.md`.
