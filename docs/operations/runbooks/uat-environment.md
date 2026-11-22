# Procedure: bootstrap, deploy and tear down the UAT environment

> **Status:** Draft · written 2026-11-21 (`WI-DEP-002` steps 7 to 9), NOT RUN: nothing here has been done in Azure or Azure DevOps. Decision: ADR-0020 decision 9 and its note of 2026-11-21. Pipeline: [`azure-pipelines-uat.yml`](../../../azure-pipelines-uat.yml). It becomes Current when a UAT deploy and a UAT teardown have run and "Last tested" says so.

**Purpose.** Create what UAT needs once (the lead, by hand: IAM), then deploy a passing dev build to UAT, run the deployed suite against both environments side by side, and tear UAT down. UAT runs the same stage template and Terraform module as dev, in promote mode: it deploys the digests a dev run recorded, only if that run's smoke passed, and builds nothing.

## 0. Dev's deploy identity first: no role on anything of UAT's (register 231)

Today `bakery-deploy` holds Contributor and the role-assignment right on all of `rg-bakery-foundation`, where UAT's apps identity will live, so a dev run could give a dev app UAT's identity, or add a credential to it, and read UAT's Key Vault. Narrow it before UAT exists. **Confirmed by the lead on 2026-11-21** (register 231):

| Change | Role | Scope |
|---|---|---|
| remove | Contributor | `rg-bakery-foundation` |
| remove | Role Based Access Control Administrator (conditioned) | `rg-bakery-foundation` |
| add | Reader | `rg-bakery-foundation` (the push step looks the registry up there: `az acr list`, `az acr login`) |
| add | Managed Identity Operator | `id-bakery-dev-apps` only (Terraform gives the dev apps that identity, an action on the identity) |
| keep | Contributor; Role Based Access Control Administrator (conditioned) | `rg-bakery-dev` |
| keep | Storage Blob Data Contributor | the `tfstate` container |
| keep | AcrPush | the registry |

Nothing in a pipeline writes to the foundation group: the foundation is applied from your machine as you, and the pipeline only reads its state and pushes images. Not tried in Azure.

The change, from Git Bash on your machine, signed in as yourself (`az login`), when the branch's pull request is green and just before you merge it. `DEPLOY` is `bakery-deploy`'s object id, the dev pipeline's `DEPLOY_PRINCIPAL_ID` variable (an id, not a secret):

```bash
export MSYS_NO_PATHCONV=1   # Git Bash would otherwise turn each /subscriptions/... scope into a Windows path
DEPLOY=<bakery-deploy object id>
fnd="/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-bakery-foundation"
az role assignment list --assignee "$DEPLOY" --all --query "[].{role:roleDefinitionName, scope:scope}" -o table   # before
az role assignment delete --assignee "$DEPLOY" --role "Contributor" --scope "$fnd"
az role assignment delete --assignee "$DEPLOY" --role "Role Based Access Control Administrator" --scope "$fnd"
az role assignment create --assignee-object-id "$DEPLOY" --assignee-principal-type ServicePrincipal --role "Reader" --scope "$fnd"
az role assignment create --assignee-object-id "$DEPLOY" --assignee-principal-type ServicePrincipal --role "Managed Identity Operator" \
  --scope "$fnd/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-bakery-dev-apps"
az role assignment list --assignee "$DEPLOY" --all --query "[].{role:roleDefinitionName, scope:scope}" -o table   # after
```

Afterwards the list must be exactly the "add" and "keep" rows above, plus Key Vault Secrets Officer on dev's vault while dev exists (the stack creates it). Then merge, and the next dev run's identity checks prove the set.

**Order.** The identity check refuses any set but the expected one, and the expected set changes with the branch that carries this change. Do the role change in Azure and the merge of that branch back to back, with no dev run in between; a dev run in the gap fails at its first step, before it changes anything. Then run dev once (`chaosScenario: none`) to prove the new set: the plan and apply identity checks, the apply (if it has changes), the push and the deploy. The dev run without the cache Redis (`cacheRedis` off, register 216) can be that run: the identity checks come first, so a failure there is the roles, not the switch.

## 1. Bootstrap (once; the lead; IAM changes need the lead's approval)

Do these in this order. Copy the shape of each command from [`bootstrap-terraform-state.md`](bootstrap-terraform-state.md), which did the same for dev on 2026-11-19, and record what you ran like `docs/evidence/WI-DEP-001/bootstrap-2026-11-19.md`. Print no secret; the outputs below are ids and names, none a secret.

1. **Foundation** (step 6): add `"uat"` to `app_identities` in the foundation's variables file (outside the repository), plan from your machine and check the plan **adds exactly two** resources (`azurerm_user_assigned_identity.apps["uat"]` and `azurerm_role_assignment.acr_pull_apps["uat"]`) and changes nothing; then apply. `infra/foundation/tests/foundation.tftest.hcl` shows the same with a mocked provider.
2. **Resource group** `rg-bakery-uat` in **East US 2** (`eastus2`): the subscription allows one Container Apps environment per region and dev's is in East US (register 229). The UAT stack reads its region from this group.
3. **State container** `tfstate-uat` in the state account, with the same settings as `tfstate` (Entra-only access, versioning and soft delete are account settings already on).
4. **Deploy identity and connection** `bakery-uat-deploy` (workload identity federation, as `bakery-deploy`), pipeline permission for the UAT pipeline only. Its roles, **confirmed by the lead on 2026-11-21** (registers 230, 231); `scripts/ci/identity-check.mjs` refuses anything else:

   | Role | Scope | Why |
   |---|---|---|
   | Contributor | `rg-bakery-uat` | the stack's resources |
   | Role Based Access Control Administrator, with the same condition as dev's (only Key Vault Secrets User and Key Vault Secrets Officer) | `rg-bakery-uat` | the stack's two Key Vault role assignments |
   | Storage Blob Data Contributor | the `tfstate-uat` container only | UAT's state; no read of `tfstate`, which holds dev's state and so dev's Cosmos keys (register 214) |
   | Reader | `rg-bakery-foundation` | the Azure CLI looks the registry up there |
   | Managed Identity Operator | `id-bakery-uat-apps` only | giving UAT's container apps their identity is an action on that identity |
   | AcrPull | the registry | the application deploy reads the build tags of the images the apps run, to refuse an older build (register 110) |

   The same shape as dev's after section 0, with AcrPull where dev has AcrPush (a promote run pushes nothing). No role on anything of dev's.
5. **Plan identity and connection** `bakery-uat-plan`, UAT's own (register 231), pipeline permission for the UAT pipeline only: **Reader on the subscription** and **Storage Blob Data Reader on `tfstate-uat` only**. `bakery-plan` stays dev's and gets no read of `tfstate-uat`: UAT's state will hold UAT's Cosmos keys (register 214). Reader on the subscription is what lets a plan identity check its deploy identity's complete roles; it reads no secret (listing keys and reading vault secrets are actions it does not hold), but it does read the other environment's resource settings and can query its Log Analytics workspace. Its object id is not a pipeline variable (the connection signs it in); `PLAN_CONNECTION_ID` is this connection's id.
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
- Do not reject or leave `uat-app` after an apply that changed an app: the apply puts a changed app back on the placeholder image and only the application deploy restores the promoted digest (register 217, accepted as in dev).
- Do not name a chaos scenario for UAT: the pipeline does not offer one and the module refuses it (ADR-0024).

## Last tested

Never.
