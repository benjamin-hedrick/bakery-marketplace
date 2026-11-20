# Procedure: tear down the dev environment

> **Status:** Draft · written 2026-11-20 before the first dev apply, so that anything created can be removed the gated way (the lead's condition for deploying). Not run. Decision: ADR-0020 decision 7. Pipeline: [`azure-pipelines-dev.yml`](../../../azure-pipelines-dev.yml), action `destroy`. It becomes Current when a real teardown has run and its "Last tested" says so.

**Purpose.** Remove everything the dev environment stack created, inside `rg-bakery-dev`, and nothing else: not the resource group (the bootstrap made it), not the foundation (registry, apps identity, budget alert of the foundation), not the state. Costs stop when it finishes (`docs/management/budget-cost-estimate.md`, the dev environment section).

## Before you start

1. The pipeline variables are set (the header of `azure-pipelines-dev.yml` lists them: seven plain, one secret).
2. Nothing else is running in the pipeline: the `dev-destroy` environment's exclusive lock serialises destroys, but a deploy waiting at `dev-infra` would re-create what you remove.

## Steps

1. **Run pipeline** on `main`: action `destroy`, plan mode `real`, confirmation `dev`.
2. `inputs` checks the confirmation. Anything other than `dev` stops the run.
3. `destroy_plan`, as the read-only `bakery-plan`:
   - checks its own roles (bootstrap check 6);
   - makes a destroy plan **from the state alone** (`-refresh=false -lock=false`: it reads nothing in Azure, so no secret);
   - runs the **destroy guard** on that plan: a pure destroy, every resource inside `rg-bakery-dev`, nothing tagged as foundation or persistent;
   - publishes `dev-destroy-summary` (addresses and actions only).
   If the state is empty, the plan has no changes and the run ends here: there is nothing to destroy.
4. Read the summary (the run's **Related > published** artifacts, or the step log). Every line should say `delete`, and the list should be what the dev stack creates (about 26 resources with the budget alert).
5. **Approve** at `dev-destroy` only if the summary is what you expect.
6. `destroy_apply`, as `bakery-deploy`:
   - checks its own roles;
   - re-plans the destroy **with** refresh and under the state lock;
   - runs the guard again;
   - refuses unless the plan has exactly the approved summary's resources and actions (register 110);
   - destroys the saved plan, and prints how long it took;
   - **fails unless `rg-bakery-dev` is empty** afterwards.

## Verify

- The run is green and its last line says `rg-bakery-dev is empty.`
- In the portal or with `az resource list -g rg-bakery-dev`: no resources. `rg-bakery-dev` itself still exists, empty (the bootstrap owns it).
- `rg-bakery-foundation` is untouched: the registry and its images, the apps identity and the foundation's budget alert are still there.
- The Key Vault is **soft-deleted, not purged**: `az keyvault list-deleted` shows it for 7 days (see below).
- A day or two later, Cost Management for `rg-bakery-dev` stops growing.

## The Key Vault after a teardown

The deploy identity cannot purge a deleted vault (purging is a subscription-level action, and its rights stop at two resource groups), so the stack does not purge (`infra/environments/dev/versions.tf`, register 108). For 7 days the deleted vault keeps its name. In that time:

- a rebuild with the same `KEY_VAULT_NAME` **recovers** the vault and its deleted secrets (the provider's default), and the post-apply step overwrites the old values; not yet seen working;
- or set a new `KEY_VAULT_NAME` (check it is free first);
- or purge it yourself as the subscription owner: `az keyvault purge --name <vault>` (a few minutes).

## What can go wrong

| Symptom | Meaning | Do |
|---|---|---|
| `destroy_plan` fails at the guard | The plan touches something outside `rg-bakery-dev`, or is not a pure destroy | Stop. Do not change the guard to make it pass. Read its reasons and record them in the register |
| `destroy_apply` refuses: "differs from the approved plan" | The state changed between the plan and the approval (another run, or a drift the refresh found) | Run the teardown again from the start; the new plan is what you approve |
| The destroy fails part-way | A resource could not be deleted (a permission, a dependency, Azure) | Run the teardown again: the plan is made from what the state still holds. If it fails the same way twice, escalate |
| "Resources are left in rg-bakery-dev" | Something in the group is not managed by the stack (made by hand, or a platform leftover) | List them (`az resource list -g rg-bakery-dev -o table`), decide with the lead, delete by hand, record it |
| `AADSTS700024` in a step | The sign-in token expired: the token refresh is not working | Check `PLAN_CONNECTION_ID` and `DEPLOY_CONNECTION_ID` are the connections' ids |

## What not to do

- Do not delete `rg-bakery-dev` or anything in `rg-bakery-foundation` or `rg-bakery-tfstate` by hand to "finish" a teardown.
- Do not run `terraform destroy` from a laptop as the subscription owner: the guard and the approval exist so a destroy is checked and seen.
- Do not approve a destroy whose summary you have not read.

## Escalate when

The guard refuses, a destroy fails twice in the same place, or anything outside `rg-bakery-dev` changed. Stop and record it in the open-items register.

## Last tested

Never. The guard and the comparison with the approved plan are unit-tested (`scripts/ci/tests/destroy-guard.test.mjs`, `plan-summary.test.mjs`) and the pipeline's structure is checked (`pipeline-structure.test.mjs`); none of that is a run on Azure.
