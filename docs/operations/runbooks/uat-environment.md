# Procedure: bootstrap, deploy and tear down the UAT environment

> **Status:** Draft · written 2026-11-21 (`WI-DEP-002` steps 7 to 9), NOT RUN: nothing here has been done in Azure or Azure DevOps. Decision: ADR-0020 decision 9 and its note of 2026-11-21. Pipeline: [`azure-pipelines-uat.yml`](../../../azure-pipelines-uat.yml). It becomes Current when a UAT deploy and a UAT teardown have run and "Last tested" says so.

**Purpose.** Create what UAT needs once (the lead, by hand: IAM), then deploy a passing dev build to UAT, run the deployed suite against both environments side by side, and tear UAT down. UAT runs the same stage template and Terraform module as dev, in promote mode: it deploys the digests a dev run recorded, only if that run's smoke passed, and builds nothing.

## 1. Bootstrap (once; the lead; IAM changes need the lead's approval)

Do these in this order. Copy the shape of each command from [`bootstrap-terraform-state.md`](bootstrap-terraform-state.md), which did the same for dev on 2026-11-19, and record what you ran like `docs/evidence/WI-DEP-001/bootstrap-2026-11-19.md`. Print no secret; the outputs below are ids and names, none a secret.

1. **Foundation** (step 6): add `"uat"` to `app_identities` in the foundation's variables file (outside the repository), plan from your machine and check the plan **adds exactly two** resources (`azurerm_user_assigned_identity.apps["uat"]` and `azurerm_role_assignment.acr_pull_apps["uat"]`) and changes nothing; then apply. `infra/foundation/tests/foundation.tftest.hcl` shows the same with a mocked provider.
2. **Resource group** `rg-bakery-uat` in **East US 2** (`eastus2`): the subscription allows one Container Apps environment per region and dev's is in East US (register 229). The UAT stack reads its region from this group.
3. **State container** `tfstate-uat` in the state account, with the same settings as `tfstate` (Entra-only access, versioning and soft delete are account settings already on).
4. **Deploy identity and connection** `bakery-uat-deploy` (workload identity federation, as `bakery-deploy`), pipeline permission for the UAT pipeline only. Its roles, **proposed for your approval** (register 230); `scripts/ci/identity-check.mjs` refuses anything else:

   | Role | Scope | Why |
   |---|---|---|
   | Contributor | `rg-bakery-uat` | the stack's resources |
   | Role Based Access Control Administrator, with the same condition as dev's (only Key Vault Secrets User and Key Vault Secrets Officer) | `rg-bakery-uat` | the stack's two Key Vault role assignments |
   | Storage Blob Data Contributor | the `tfstate-uat` container only | UAT's state; no read of `tfstate`, which holds dev's state and so dev's Cosmos keys (register 214) |
   | Managed Identity Operator | `id-bakery-uat-apps` (in `rg-bakery-foundation`) | giving UAT's container apps their identity is an action on that identity; dev's deploy identity has it through Contributor on the foundation group, which UAT's does not get |
   | AcrPull | the registry | the application deploy reads the build tags of the images the apps run, to refuse an older build (register 110) |

   Not given, unlike dev's: anything else in `rg-bakery-foundation`, and AcrPush (a promote run pushes nothing).
5. **Plan identity** `bakery-plan` (reused): add **Storage Blob Data Reader on `tfstate-uat`**. Its Reader on the subscription already covers UAT. The identity check accepts it with or without this role, so dev runs are not affected.
6. **Approval environments** `uat-infra`, `uat-app`, `uat-destroy`: each with an approval, branch control (`main` only) and an exclusive lock, as dev's (`prove-the-pipeline-gates.md`).
7. **Register the pipeline** `bakery-uat-operations` from `azure-pipelines-uat.yml`, and set its variables (its header lists them). The foundation's outputs for UAT go in as plain variables: `REGISTRY_LOGIN_SERVER`, `APP_IDENTITY_ID`, `APP_IDENTITY_PRINCIPAL_ID` (`terraform -chdir=infra/foundation output app_identities`, the `uat` entry, read on your machine). `DEV_PIPELINE_ID` is the dev pipeline's definition id (the number in its URL). `KEY_VAULT_NAME` and `COSMOS_ACCOUNT_NAME` are UAT's own, globally unique, not dev's.
8. **Rehearse** once with `planMode: rehearsal` and a real `devBuild`, to prove the three new approval environments' checks before any real step (G1 to G8 of `prove-the-pipeline-gates.md`, with `uat-*`).

## 2. Deploy a dev build to UAT

1. Pick a dev run on `main` whose smoke passed (the dev pipeline's run list; its `smoke` stage is green). Its run id is `devBuild`.
2. **Run pipeline** `bakery-uat-operations` on `main`: action `deploy`, `devBuild` = that id, plan mode `real`, **`mockIssuer` on** (until Entra a run with it off is refused, register 222), **`seed` on for the first run** (a new UAT database is empty and the deployed suite needs the seed data; later runs may leave it off).
3. `inputs` refuses unless that dev run was a real deploy from `main`, its smoke succeeded, and it published its digest record. `images` fetches that record; nothing is built.
4. Approve `uat-infra` only after reading the plan summary (the first run creates the whole stack, the same resources as dev's: about 26 with the budget alert). The Cosmos account is created in East US 2 off the free tier; Azure may refuse it for capacity, as East US refused dev's (register 229).
5. Approve `uat-app`. It sets the Key Vault secrets, runs the seed if asked, and updates each app to the promoted digest.
6. `smoke` and `observe` run as in dev. Their evidence is the run's `uat-smoke` and `uat-observe` artifacts (read through the step logs, as for dev: TF400813).

## 3. Side by side

With both environments up, run the deployed suite against each in the same session from your machine (`apps/web-customer`: `WEB_URL=... ISSUER_URL=... npx playwright test -c playwright.deployed.config.ts`, the addresses from each run's deployment record). Record both under `docs/evidence/WI-DEP-002/`.

## 4. Tear down

As [`dev-environment-teardown.md`](dev-environment-teardown.md), with `bakery-uat-operations`, confirmation `uat`, approval at `uat-destroy`, and `rg-bakery-uat` in place of `rg-bakery-dev`. The foundation's UAT identity and its AcrPull stay (they are persistent, like dev's).

## What not to do

- Do not queue the UAT pipeline before step 1 is done: an approval environment Azure DevOps has not seen is created on first use with no checks (ADR-0020, "Not verified").
- Do not give `bakery-uat-deploy` dev's roles to make a run pass; read the identity check's reasons and decide.
- Do not name a chaos scenario for UAT: the pipeline does not offer one and the module refuses it (ADR-0024).

## Last tested

Never.
