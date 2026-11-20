# Ready to apply and tear down: costs, the apply stage, the teardown, 2026-11-20

> **Status:** Current · what was built and checked locally before the first dev apply, at the lead's request ("make sure we are truly ready to deploy, understand the costs, and teardown before proceeding"). Nothing here has run in Azure DevOps; nothing was created in Azure. Work item: `WI-DEP-001`. Decisions: ADR-0020, register items 108, 110, 213, 214, 216.

## What was built

| Piece | What | Checked |
|---|---|---|
| **Costs** (A) | `docs/management/budget-cost-estimate.md`: the dev environment as built, per day while up (about $1 to $4; the three always-on Redis apps are the only fixed part), rates taken from secondary sources the same day; running dev without Redis (register 216) | Rates not confirmed on Azure's own pages (they showed no figures to an automated reader); to be compared with Cost Management after the first deployment |
| **Dev budget alert** (A) | `budget-bakery-dev` on `rg-bakery-dev`, 10 a month, in the dev stack (created and destroyed with it), starting in the month it is created (`time_static`); contact from the secret pipeline variable `BUDGET_CONTACT_EMAIL` | Mocked tests (no budget without contacts; amount, name, monthly, two notifications); a real local plan as the lead: **26 to add** (24 plus the budget and its timestamp) |
| **Identity check** (C) | `scripts/ci/identity-check.mjs`: bootstrap check 6 for either identity, expected roles by identity (the deploy identity's Key Vault role optional, as it exists only with an environment), conditions checked, create probe | 7 unit tests; run against the lead's own sign-in: it listed the roles, reported them as wrong for the plan identity and stopped before the probe (exit 1) |
| **Apply stage** (B, register 110) | `infra_apply` real: the deploy identity checks itself, re-plans under the lock, `plan-summary.mjs --expect` refuses unless the plan has exactly the approved summary's resources, actions and outputs, then applies its own saved plan | 4 new unit tests of the comparison and the command line |
| **Teardown** (E) | `destroy_plan` real (the plan identity's check; a destroy plan from the state with `-refresh=false -lock=false`, so nothing is read in Azure; the real guard on it; a value-free summary) and `destroy_apply` real (the deploy identity's check; a refreshed re-plan under the lock; the guard again; the comparison; the destroy, timed; a failure unless `rg-bakery-dev` is empty). Procedure: `docs/operations/runbooks/dev-environment-teardown.md` | Structure tests below |
| **Key Vault at teardown** (register 108) | No purge of the vault or its secrets on destroy: purging is a subscription-level action the deploy identity does not hold, so the first teardown would have failed part-way. Recovery on rebuild is the provider's default | Read from the role's scope and the provider settings; not run |
| **Token lifetime** | The federated token a step receives lasts about 10 minutes ([Azure DevOps blog, 2023](https://devblogs.microsoft.com/devops/introduction-to-azure-devops-workload-identity-federation-oidc-with-terraform/)), shorter than an apply (Cosmos and the Container Apps environment take minutes each). Terraform now signs in with Azure DevOps' token refresh ([2025](https://devblogs.microsoft.com/devops/introducing-azure-devops-id-token-refresh-and-terraform-task-version-5/)): the connection id, the job's access token and the OIDC request address (`ado_pipeline_service_connection_id` in azurerm 4.81.0's provider schema). Shared setup: `scripts/ci/dev-stack-env.sh`; tool install: `pipelines/templates/terraform-tools.yml` | Not run: the next pipeline run shows it |

## Checks run

- Script tests: 77 pass (`node --test scripts/ci/tests/*.test.mjs`).
- **Mutation check of the pipeline structure tests:** four changes to the pipeline file, each breaking one rule, were each caught: the plan stage losing `-lock=false`; the destroy plan refreshing; the apply losing the comparison with the approved plan; the plan stage using the deploy connection. The file was restored after each.
- The pipeline file and the template parse as YAML, and all 15 inline scripts pass `bash -n` (macros replaced by a placeholder). Azure DevOps' own validation happens only on a run.
- Terraform checks (format, init, validate, mocked tests of both stacks): 7 of 7 pass, run with the local `.terraform` folders set aside (they hold the real backend settings from this session's local runs, which the checks' container cannot use; the pipeline starts from a clean checkout).

## Before the first real run

The lead adds three pipeline variables: `PLAN_CONNECTION_ID`, `DEPLOY_CONNECTION_ID` (each service connection's id, from its page in Azure DevOps) and `BUDGET_CONTACT_EMAIL` (marked secret).

## Not done

- Any run of the apply or the teardown; `bakery-deploy`'s check 6.
- Images, the post-apply secret step and the application deploy (goal 2).
- Register 213's refresh half: the deploy plan stage still refreshes as `bakery-plan`; the first plan after the dev apply shows whether it can.
