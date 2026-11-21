> **Status:** Proposed · the lead decides: the proposal below (register 229), first the ADR-0020 note and the two refactors (steps 1 and 2), which need the lead's approval before anything is built

```
WI ID:               DEP-002
Title:                A UAT environment next to DEV: deployed on demand, promoted from a passing DEV run, torn down like DEV
Type:                 Document/Artifact
Epic:                 EPIC-CLOUD-INFRA
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Proposed
Size:                 M
```

> Written 2026-11-21 at the lead's request (register 229). The lead wants a UAT environment deployed next to DEV, and expects it to be small additive changes, because ADR-0020 decision 9 designed UAT in from the start. This spec says what of that design is already in the code, what is not, and the steps that close the difference. Nothing here is built.

**Context / Why**

ADR-0020 decision 9 designed UAT and Prod as a second pipeline over the same templates, an environment root per folder validated on every pull request, and promotion of the same image digest after a recorded passing smoke in the environment before it. Decision 9 also said UAT and Prod would be reviewed and never run; the lead now wants UAT run. The lead has decided that UAT has its own Cosmos account, off the free tier (register 229).

**What of the design is already in the code (no change needed)**

- `scripts/ci/dev-stack-env.sh` takes the environment as an argument, initialises `infra/environments/<environment>` with the state key `<environment>.tfstate`, and reads that environment's apps identity from the foundation's `app_identities` map.
- The dev stack's names come from `var.environment` (`log-`, `cae-`, `budget-bakery-<environment>`); the resource group, vault and Cosmos names are variables; the budget is per environment.
- `host_environment` refuses `Development` for any environment but `dev`, so a UAT root must run as `Staging` or `Production`, and chaos scenarios are refused outside dev (ADR-0024).
- The pipeline's steps read `ENVIRONMENT_NAME` and `RESOURCE_GROUP`; the identity check, the destroy guard and the teardown's emptiness check take the environment and group as arguments.
- The foundation's `app_identities` is a list (`["dev"]` today), so a UAT apps identity with AcrPull is one more entry.
- The mock issuer's guard is not tied to the name `dev`: a deployed issuer needs its switch, an https issuer and a role list (Customer only by default).
- The deployed suite, the warm-up, the latency run and the observe step take the public addresses and the group as arguments.

**What is not (the difference)**

1. **The Terraform is one root, not shared code.** `infra/environments/dev` holds every resource directly. A UAT root would have to copy about 680 lines, or the resources move into a module that both roots call. The `staging` folder the ADR mentions was never created.
2. **The pipeline is one file, not templates.** `azure-pipelines-dev.yml` (578 lines) holds every stage; only the Terraform install is a template. Its approval environments (`dev-infra`, `dev-app`, `dev-destroy`), variables and connections are written into it. There is no promote pipeline and no check of a previous environment's smoke.
3. **The seed refuses every deployed environment but dev.** `SeedTarget` accepts only `Deployment:Environment = dev` (register 224), so a UAT would start empty and the deployed suite could not run there.
4. **The identities are dev's.** `bakery-deploy` is scoped to `rg-bakery-dev` and the foundation group; its Storage Blob Data Contributor on the `tfstate` container would also let it write a UAT state, and the other way round.
5. **ADR-0020 says promotion imports the digest into that environment's registry.** There is one registry, in the foundation.

So the design holds, but two pieces were built only for dev and need a refactor first (items 1 and 2). The rest is additive.

**Proposal, in order (each step small, each one a commit)**

1. **ADR-0020, a dated note** (the decision text is not edited): UAT is deployed on demand with the same gates, and created and torn down like dev; Prod stays designed only. UAT uses the foundation's registry (the same digest, nothing imported); a Prod registry of its own stays the design for Prod.
2. **Refactors, no behaviour change, each proved before UAT exists:**
   a. The dev root's resources move into `infra/modules/environment` (variables, outputs and the resources as they are). `infra/environments/dev` keeps its backend, provider and variable file and calls the module, with `moved` blocks so the state keeps every resource. Proof: `terraform-checks.mjs` passes, and a plan against the dev state shows no changes (from the lead's machine, read only).
   b. The pipeline's stages move into `pipelines/templates/environment-stages.yml`, with parameters for the environment, the group, the approval environments, the connection ids, and whether the run builds images or promotes them. `azure-pipelines-dev.yml` calls it with the values it has today. Proof: `pipeline-structure.test.mjs` passes unchanged in what it checks, and the next dev run behaves as build 88 did.
3. **`infra/environments/uat`**: a thin root calling the same module with `environment = "uat"`, `resource_group_name = "rg-bakery-uat"`, `host_environment = "Production"`, `cosmos_free_tier = false`, its own vault and Cosmos names and budget; `uat.tfvars.example`. `terraform-checks.mjs` validates it.
4. **Foundation:** `app_identities = ["dev", "uat"]` (one more apps identity with AcrPull). Applied from the lead's machine after a plan is shown, as the foundation was on 2026-11-20.
5. **Bootstrap for UAT (the lead, in Azure and Azure DevOps; IAM):** the group `rg-bakery-uat`; a deploy connection `bakery-uat-deploy` with the same roles as `bakery-deploy` but on `rg-bakery-uat` (Contributor, and RBAC Administrator limited by condition to the two Key Vault roles); the plan connection `bakery-plan` reused (Reader on the subscription already covers UAT); approval environments `uat-infra`, `uat-app`, `uat-destroy` with an approval, branch control (`main` only) and an exclusive lock; the pipeline variables. Recorded in an evidence file like `bootstrap-2026-11-19.md`.
6. **`azure-pipelines-uat.yml`** (`trigger: none`, `pr: none`): the same template in promote mode. It takes a dev build number, refuses unless that run's smoke stage succeeded, and deploys that run's recorded digests (`dev-images-pushed`): no image is built for UAT. The plan, apply, deploy, smoke with the warm-up, observe and destroy stages are the template's, so UAT runs the code dev runs.
7. **Seed data in UAT:** `SeedTarget` accepts `uat` as well as `dev`, never anything else, with tests; the seed job is in the module, so UAT gets the same seed. (If the lead prefers an empty UAT, this step goes and the deployed suite does not run there.)
8. **Mock issuer in UAT:** the same switch and limits as dev (public, Customer logins only). No code change; it is an auth setting, so it is the lead's call. Entra stays the later step (register 222).
9. **Runbooks and evidence:** the teardown runbook names UAT; the first UAT run, its smoke and its teardown are recorded under `docs/evidence/WI-DEP-002/`.

**Decisions for the lead**

1. Approve the ADR-0020 note in step 1 (UAT run on demand; one shared registry for dev and UAT).
2. Approve the two refactors of step 2 (module extraction with `moved` blocks; pipeline stages into a template), done before any UAT code and proved to change nothing for dev.
3. State isolation: share the `tfstate` container (simplest; each deploy identity could write the other's state), or give UAT its own container `tfstate-uat` with its deploy identity's role on that container only (one more backend setting; dev unchanged). Proposed: UAT's own container.
4. Seed UAT with the demo data (step 7), or keep it empty.
5. The mock issuer in UAT (step 8).
6. Which subscription the trial credits are on. A new subscription means a fresh bootstrap (state account, registry or cross-subscription pull, connections), not the steps above; and free-trial subscriptions have low quotas that may refuse a second Container Apps environment or a second Cosmos account.
7. Whether DEV stays up while UAT is built, or both are created for the side-by-side run and torn down after.

**Cost (while UAT is up)**

The same shape as dev (`docs/management/budget-cost-estimate.md`): three Redis apps always on, the other apps scaled to zero, Key Vault and Log Analytics at small usage, plus a Cosmos account off the free tier at 400 RU/s shared (about 0.03 USD an hour, about 0.77 a day). The Container Apps monthly free grant is per subscription, so two environments use it up about twice as fast. The registry is shared and already paid for. A budget alert per environment (a notification only).

**Out of scope**

- Deploying Prod (designed only, as ADR-0020 says); a Prod root may be added later the same way and validated, never applied.
- Chaos in UAT (refused outside dev by design, ADR-0024).
- Entra External ID (register 222), the vendor app (register 219), the Android app against a deployed environment (register 220).

**Requirements / Acceptance Criteria**

- A dev plan after step 2a shows no changes, and a dev run after step 2b behaves as build 88 did (the same stages, smoke 12 of 12 on fresh seed data).
- A UAT run promotes a dev build whose smoke passed, refuses one whose smoke failed or is missing, and builds no image.
- UAT's smoke (with the warm-up) and observe stages pass, and their evidence is recorded.
- A UAT teardown leaves `rg-bakery-uat` empty and the foundation, the tfstate account and dev untouched.
- Anything found while doing it and not fixed is recorded in the register in the same change.

**Dependencies**

- Blocked by: the lead's decisions above.
- Builds on: `WI-DEP-001` (the dev environment, build 88, `docs/evidence/WI-DEP-001/first-full-dev-deploy-2026-11-21.md`).

**Inputs / References**

- ADR-0020 (decision 9 and its notes), ADR-0007, ADR-0024; register items 216, 222, 224, 228, 229.
- `docs/evidence/WI-DEP-001/bootstrap-2026-11-19.md` (the roles UAT copies), `docs/operations/runbooks/dev-environment-teardown.md`.
