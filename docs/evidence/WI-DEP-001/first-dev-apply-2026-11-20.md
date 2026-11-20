# The first dev apply, 2026-11-20

> **Status:** Current · the dev infrastructure is applied (attempt 3). Attempt 1 stopped at the deploy identity's role check before anything was created; attempt 2 created part of the stack and stopped on two errors, fixed below. The application images are not deployed yet, and the teardown is recorded separately when it has run. Work item: `WI-DEP-001`. Pipeline: `azure-pipelines-dev.yml` on `main`, action `deploy`, plan mode `real`. Identifiers are left out (this repository is public).

## Attempt 1: stopped by the deploy identity's check (nothing created)

The lead ran the pipeline after the apply and teardown stages were merged and the three new pipeline variables were set. `infra_plan` passed; the lead approved at `dev-infra`; in `infra_apply` the step "The deploy identity checks its own roles and that it cannot create (bootstrap check 6)" failed:

```
Signed in as the deploy identity, object id <id>
  Contributor at /subscriptions/<id>/resourcegroups/rg-bakery-dev (condition: false)
  Role Based Access Control Administrator at .../rg-bakery-dev (condition: true)
  AcrPush at .../rg-bakery-foundation/providers/Microsoft.ContainerRegistry/registries/<registry> (condition: false)
  Contributor at .../rg-bakery-foundation (condition: false)
  Role Based Access Control Administrator at .../rg-bakery-foundation (condition: true)
##[error]Identity check: missing: Storage Blob Data Contributor at a scope matching /\/blobServices\/default\/containers\/tfstate$/i
```

The check stopped the stage before the plan and the apply, as designed: nothing was created (`rg-bakery-dev` held 0 resources).

**Cause:** the assignment exists. Listed by the lead's sign-in, the deploy identity holds six assignments, the sixth being Storage Blob Data Contributor on the `tfstate` container. An identity sees only the role assignments at scopes it can read, and the deploy identity has no read right on `rg-bakery-tfstate` (its rights there are data-plane only). The plan identity's own check (build 70) passed because Reader on the subscription lets it see everything. The check assumed an identity can list all of its own assignments; that was not checked when it was written (register 201, item 22).

**Fix:**
- The deploy identity's own check no longer requires its state role (it cannot see it). It still checks every role it can see, and the create probe.
- The plan identity now checks the deploy identity's **complete** role set, in the plan and destroy-plan stages, before any approval (`identity-check.mjs --identity deploy --principal <deploy object id>`). Reading the whole subscription, it sees assignments at every scope, so it also catches a role at a scope the deploy identity cannot read, which the self-check never could.
- Checked from the lead's sign-in (which, like the plan identity, reads every scope): "The deploy identity's roles are exactly the 6 expected." Unit tests cover both views; the structure tests require the new step in both plan stages.

## Attempt 2: part of the stack created, stopped on two errors

After the fix above was merged, the lead ran the pipeline again. The plan stage passed with the new check of the deploy identity, the lead approved at `dev-infra`, the deploy identity's own check passed, and the re-plan matched the approved plan. The apply then created part of the stack and stopped. Read afterwards from the lead's sign-in (no value printed):

- **In the state, 12 managed resources, none tainted:** the Log Analytics workspace, the Container Apps environment, the Key Vault, its two role assignments and the wait for them, the three placeholder secrets, the mock issuer app, the budget alert and its start date.
- **Not created:** the three Redis apps, the four application apps, the Cosmos database and containers.
- **In Azure but not in the state:** the Cosmos account, in provisioning state `Failed`.

**Error 1, the Redis apps (our code).** The provider failed while reading the configuration of the three Redis apps (`interface conversion: interface {} is nil, not string`, in the field `Template`). Each passed `--save ""` to `redis-server`, and the provider cannot handle the empty string. The apps were never sent to Azure. Fix: a bare `--save`, which Redis 7 reads as "no snapshots" (checked in Docker with `redis:7.4-alpine` and the sessions app's exact arguments: `save` empty, `appendonly no`, `maxmemory 134217728`, `maxmemory-policy noeviction`). A test now refuses an empty argument; it fails with the old arguments.

**Error 2, Cosmos (the region).** From the subscription's activity log: "Sorry, we are currently experiencing high demand in East US region, and cannot fulfill your request at this time" (`ServiceUnavailable`), about a minute after the request. `az cosmosdb locations list` shows that East US does not allow new accounts for this subscription; East US 2, Central US, West US, West US 2 and West US 3 do. Fix: a `cosmos_location` variable, default `eastus2`, the nearest open region; everything else stays in East US. The failed account must be deleted before the next apply, because its name is taken and it is outside the state (the teardown's emptiness check would also stop on it).

**Found while checking the fix: the plan stage cannot refresh the stack now that it exists.** A refreshed plan from the lead's sign-in failed on `getSecret` for each Key Vault secret (403): refreshing a secret reads its value, which `bakery-plan` may not do either. The plan and the apply's re-plan are now made from the state (`-refresh=false`), as the destroy plan already was (register 213). Two differences between Azure and the state would otherwise have shown in every plan: Azure gives the environment and every app a `Consumption` workload profile. The apps now name it, and the environment ignores it (declaring it would make a plan from the state replace the environment).

**The state's secrets (register 214):** the three Key Vault secrets' `value` is empty and `value_wo_version` is 1.

**After the fixes,** a local plan from the state as the lead, the same command as the pipeline: 14 to add, 0 to change, 0 to destroy (26 resources with the 12 already there); the summary holds none of the private values.

## Attempt 3: the stack applied

Before it, on the lead's approval, the agent deleted the failed Cosmos account from the lead's sign-in (`az cosmosdb delete`); afterwards `rg-bakery-dev` held only the four resources the state manages there (the vault, the workspace, the environment, the mock issuer app) and `az cosmosdb check-name-exists` reported the name free.

The fixes were merged and the lead ran the pipeline on `main` (action `deploy`, plan mode `real`) and approved at `dev-infra`. The run finished without error. Checked afterwards from the lead's sign-in (no value printed):

- **Azure:** `rg-bakery-dev` holds the 12 Azure resources the stack makes there: the vault, the workspace, the environment, eight container apps (three Redis, catalog, ordering, the BFF, web, the mock issuer), and the Cosmos account, in East US 2, provisioning state `Succeeded`, free tier on. Everything else is in East US. Every app has provisioning state `Succeeded` and the `Consumption` workload profile.
- **State:** 26 managed resources, none tainted. A plan from the state afterwards, the pipeline's command, reports "No changes. Your infrastructure matches the configuration.", so the workload-profile fixes hold.
- **The Redis apps:** each revision is `Healthy`, running at its one replica.
- **The application apps** (catalog, ordering, the BFF, web, the mock issuer) still run Azure's placeholder image (`mcr.microsoft.com/k8se/quickstart`), as the stack creates them until the application deploy sets the real images. Their revisions are `ActivationFailed` with 0 replicas: the system log shows the startup probe failing (the placeholder does not listen on the apps' ports). Expected; no cost while at 0 replicas. The mock issuer's system log shows "Sync with secrets from Azure Key Vault was successful": the persistent apps identity can read the vault through the references, before any real value is set.
- **Role assignments (register 106):** the deploy identity created both Key Vault assignments (Secrets User for the apps identity, Secrets Officer for itself) through its conditioned Role Based Access Control Administrator right. That the condition refuses other roles is not shown by this run.
- **Secrets in the state (register 214):** the three Key Vault secrets' `value` empty; the apps' secrets are all Key Vault references with no value; set, as accepted: 8 of the Cosmos account's 12 sensitive attributes (its keys and connection strings) and the workspace's 2 shared keys. Each app also records `custom_domain_verification_id`, marked sensitive, which is not a secret (a public DNS verification value).

Costs from now until the teardown: the three Redis apps, roughly $0.58 to $1.94 a day together (`docs/management/budget-cost-estimate.md`); everything else is at zero replicas or inside free grants.

Not done in this run: the images, the post-apply secret step, the application deploy and the smoke tests (goal 2's next steps), and the teardown.
