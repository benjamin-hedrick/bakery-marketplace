# DEV and UAT torn down, 2026-11-22 (UTC 2026-11-22 to 2026-11-23)

> **Status:** Current · both environments destroyed by the lead through the pipelines, read afterwards from the build logs and from Azure by the agent (the lead's Azure CLI sign-in, read-only commands). The step logs were read for the plan, the guard, the duration and the emptiness check; the approvals were the lead's and are not in the logs.

Work items: `WI-DEP-001` (teardown and cost evidence, goal 2) and `WI-DEP-002` (the UAT teardown, register 235).

## The runs

| Environment | Build | Pipeline | Started to finished (UTC) | Result |
|---|---|---|---|---|
| UAT | 116 | `bakery-uat-operations`, action destroy | 2026-11-22 23:39 to 23:50 | succeeded |
| DEV | 118 | `bakery-dev-operations`, action destroy | 2026-11-23 01:27 to 02:13 | succeeded |

Each run's destroy plan was made from the state alone by the read-only identity, passed the destroy guard, was approved, and was re-planned under the state lock; the apply step then refused unless the plan was the approved one ("the plan to apply is the approved plan (same resources, actions and outputs)") and ended with the emptiness check.

| | UAT (build 116) | DEV (build 118) |
|---|---|---|
| Plan | 0 to add, 0 to change, **17 to destroy** | 0 to add, 0 to change, **27 to destroy** |
| Destroy guard | OK, all 17 in `rg-bakery-uat` | OK, all 27 in `rg-bakery-dev` |
| Destroy took | 507 s | 1387 s |
| Emptiness check | Listed `cosmos-bakery-uat-juoki` once (check 1 of 20), then "rg-bakery-uat is empty." | Listed `log-bakery-dev` once (check 1 of 20), then "rg-bakery-dev is empty." |

UAT's 17 were what the first UAT apply had created before Azure refused the second Container Apps environment (register 235): no environment and no apps. DEV's 27 were the build 117 environment (with the cache Redis, `dev-chaos`, no tracing: the tracing resources of `WI-OBS-001` were not in this build).

## What Azure showed afterwards

Read by the agent on 2026-11-23, with `az`:

- `az resource list` for `rg-bakery-dev` and `rg-bakery-uat`: **nothing in either**. Both groups still exist (the bootstrap owns them).
- `rg-bakery-foundation`: the registry `bakerymktjpf1x9` and the two apps identities (`id-bakery-dev-apps`, `id-bakery-uat-apps`), untouched.
- `az containerapp env list`: **no Container Apps environment in the subscription**, so the subscription's one slot is free again.
- `az keyvault list-deleted`: `kv-bakery-uat-juoki` (purge date 2026-11-29) and `kv-bakery-dev-juoki` (2026-11-30), both soft-deleted as the runbook says. A new DEV create with the same `KEY_VAULT_NAME` recovers the vault (not yet seen working, register 108).
- Not checked: Cost Management for either group, which lags by a day or two, and the UAT bootstrap items other than the group and the identity (state container `tfstate-uat` and its `uat.tfstate`, the approval environments, the pipeline), which the lead left in place.

## What this shows and does not

- Shows: the gated destroy ran twice in one night on two environments, each time ending with an empty group and the foundation intact, and the second DEV teardown (27 resources, 23 minutes) is a repeat of the first (`first-dev-teardown-2026-11-20.md`) on a larger environment.
- Does not show: that the soft-deleted vaults can be recovered, or that cost stopped growing.
