# The first dev teardown, 2026-11-20

> **Status:** Current · in progress: attempt 1 was refused by the destroy guard before the approval (nothing destroyed); the fix is below; attempt 2 is recorded here when it has run. Work item: `WI-DEP-001`. Pipeline: `azure-pipelines-dev.yml` on `main`, action `destroy`, plan mode `real`, confirmation `dev`. Runbook: `docs/operations/runbooks/dev-environment-teardown.md`. Identifiers are left out (this repository is public).

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

## Attempt 2

Not run yet.
