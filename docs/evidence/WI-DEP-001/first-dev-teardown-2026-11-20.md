# The first dev teardown, 2026-11-20

> **Status:** Current · the stack is torn down: attempt 1 was refused by the destroy guard before the approval (nothing destroyed) and fixed; attempt 2 destroyed all 26 resources, and its last check failed falsely because Azure still listed a just-deleted resource (fixed in the pipeline, the fix not yet run). Work item: `WI-DEP-001`. Pipeline: `azure-pipelines-dev.yml` on `main`, action `destroy`, plan mode `real`, confirmation `dev`. Runbook: `docs/operations/runbooks/dev-environment-teardown.md`. Identifiers are left out (this repository is public).

The stack being torn down is the one applied in `first-dev-apply-2026-11-20.md` (attempt 3): 26 managed resources in `rg-bakery-dev`.

## Attempt 1: refused by the destroy guard (nothing destroyed)

`destroy_plan` ran as `bakery-plan`: the identity checks passed, and the destroy plan from the state (`-refresh=false -lock=false`) listed `Plan: 0 to add, 0 to change, 26 to destroy.` The guard then refused it:

```
destroy guard: REFUSED
  - azurerm_key_vault_secret.placeholder["cosmos-connection-string"]: cannot tell which resource group it is in, so it is not allowed.
  - azurerm_key_vault_secret.placeholder["ordering-client-secret"]: cannot tell which resource group it is in, so it is not allowed.
  - azurerm_key_vault_secret.placeholder["session-encryption-key"]: cannot tell which resource group it is in, so it is not allowed.
```

The stage failed before the approval, so nothing was asked for and nothing was destroyed.

**Cause:** a false refusal, the kind register item 107 predicted. The guard finds a resource's group in `resource_group_name`, or in an Azure resource id in `resource_group_id`, `scope` or `id`. A Key Vault secret has none of these: its `id` is the vault's data-plane URL (`https://<vault>.vault.azure.net/secrets/<name>/<version>`). Its `key_vault_id` is the vault's Azure resource id, which names the group. The guard's fixtures were hand-written and had no Key Vault secret.

**Reproduced locally** from the lead's sign-in with the pipeline's command (destroy plan from the state, no lock, no apply): the same 26 deletes and the same three refusals. The raw plan holds the Cosmos keys in clear text, so it was deleted at once. It was first reduced to the attributes the guard reads, with every identifier replaced; that reduction is now a test fixture (`scripts/ci/tests/fixtures/destroy-plan-dev-applied.json`).

**Fix** (`scripts/ci/destroy-guard.mjs`): a secret is placed in its vault's group through `key_vault_id`. The guard still fails closed:
- a secret whose vault is in another group is refused;
- a secret with no vault id is still refused;
- nothing else changed.

The runbook says not to change the guard to make a refusal pass. This change is the exception it allows for: the refusal was wrong (the secrets are in `rg-bakery-dev`, inside a vault the guard already accepts), the reason is recorded here and in register 107, and the change goes through review. New tests:
- a secret is placed in its vault's group, refused when the vault is elsewhere, and refused without one;
- **the real plan** (the reduced fixture) passes with exactly 26 deletes, none of them the resource group.

Both tests fail when the fix is removed. Run on the fixture, the guard prints `destroy guard: OK. 26 resource(s) would be deleted, all in "rg-bakery-dev".`

## Attempt 2: all 26 destroyed; the emptiness check failed falsely

Run after the guard fix was merged, the same way (`destroy`, `real`, `dev`), approved by the lead at `dev-destroy`.

- `destroy_plan` passed: the guard accepted the plan and the summary was published. The lead approved it.
- `destroy_apply` re-planned with refresh as `bakery-deploy`, under the lock. The guard and the comparison with the approved summary both run before the destroy in the same `set -e` script, so both passed: the destroy only starts after them.
- The destroy: `Apply complete! Resources: 0 added, 0 changed, 26 destroyed.` `Destroy took 1389 seconds.` (about 23 minutes). No token expiry in that time, so the Azure DevOps token refresh held for a long run.
- Then the step failed:

```
##[error]Resources are left in rg-bakery-dev after the destroy:
Microsoft.OperationalInsights/workspaces    log-bakery-dev
```

Terraform had logged `azurerm_log_analytics_workspace.logs: Destruction complete after 11s` just before.

**Cause:** Azure's resource list lags a delete. Checked from the lead's sign-in a few minutes after the run: `az resource list -g rg-bakery-dev` returned nothing, and `az monitor log-analytics workspace list-deleted-workspaces -g rg-bakery-dev` listed `log-bakery-dev`, soft-deleted. The check ran once, straight after the destroy, and caught the list before it caught up. Nothing was left behind.

**Fix** (`azure-pipelines-dev.yml`, `destroy_apply`): the check asks again every 30 seconds for up to 10 minutes and fails only if something is still listed then. A test in `scripts/ci/tests/pipeline-structure.test.mjs` pins the retry; it fails against the old single check. The loop was run in bash against a stand-in `az` that lists the workspace twice and then nothing (passes on the third check), and one that never empties (fails after 20 checks, listing it). Not yet run on Azure.

### Checked after the teardown (the lead's sign-in, 2026-11-20)

| Check | Result |
|---|---|
| `rg-bakery-dev` | Exists, 0 resources. Its two pipeline role assignments (Contributor; Role Based Access Control Administrator with the condition) are still there; the bootstrap owns them. |
| `rg-bakery-foundation` | Untouched: the registry and the apps identity, the pipeline's two role assignments on the group, AcrPull and AcrPush on the registry. |
| `rg-bakery-tfstate` | Untouched: the state storage account. |
| Key Vault | Soft-deleted, not purged (register 108): deleted 2026-11-20, scheduled purge 2026-11-27. It holds only the placeholder secrets. |
| Log Analytics workspace | Soft-deleted (Azure keeps a deleted workspace for 14 days; a workspace made with the same name in the same group in that time recovers it). |
| Cosmos | No restorable `cosmos-bakery-dev` account listed. |

Not yet seen: Cost Management for `rg-bakery-dev` flattening (a day or two behind), and a rebuild recovering the soft-deleted vault (register 108).
