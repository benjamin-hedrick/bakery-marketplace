# Foundation apply and the first real plan step, 2026-11-20

> **Status:** Current · the foundation stack's first apply and the deploy identity's roles on it, run by the agent from the lead's signed-in Azure CLI after the lead approved each step; the dev pipeline's plan step made real and run locally as the lead. The first pipeline run of the plan step is recorded below when it has run. Work item: `WI-DEP-001`. Decisions: ADR-0020, register items 106, 110, 213, 214. Identifiers (subscription, tenant, object ids, account, registry, vault and Cosmos names) are left out on purpose: they are not secrets, but this repository is public.

## Foundation stack, first apply

| Step | What | Result |
|---|---|---|
| Inputs | A variables file outside the repository (registry name, `eastus`, `app_identities = ["dev"]`, the deploy identity as the AcrPush principal, the budget contact e-mail) and the git-ignored `backend.hcl` | Present |
| Plan | `terraform plan -out` in `infra/foundation` from Git Bash, as the lead. The lead read the full plan as text (`terraform show -no-color`) before approving | `Plan: 6 to add, 0 to change, 0 to destroy`: the resource group, the registry (Basic, admin user off), the dev apps identity, AcrPull for it and AcrPush for `bakery-deploy` on the registry, the budget (10 a month; e-mail at 80 percent actual and at 100 percent forecast; it notifies only) |
| Apply | `terraform apply` of that saved plan, so exactly what was approved | `Apply complete! Resources: 6 added, 0 changed, 0 destroyed.` (about 75 s; the two role assignments about 25 s each) |
| Check | `terraform plan -detailed-exitcode` again | Exit 0: "No changes" |

The budget is the sixth resource the bootstrap's five-resource plan did not have: the lead chose the alert on 2026-11-19, and the contact e-mail is in the variables file only.

## The deploy identity's roles on the foundation group

Approved by the lead after seeing the exact assignments, then created with `az rest` and JSON bodies (the Windows `az.cmd` wrapper breaks the condition's braces), as for the dev group on 2026-11-19:

| Role | Scope | Condition |
|---|---|---|
| Contributor | `rg-bakery-foundation` | none |
| Role Based Access Control Administrator | `rg-bakery-foundation` | write and delete of a role assignment only for AcrPush (`8311e382-0749-4cb8-b61a-304f252e45ec`) and AcrPull (`7f951dda-4ed3-4680-a7ca-43fe172d538d`); condition version 2.0, the same form as the dev group's |

Azure accepted the condition as sent. `bakery-deploy` then held exactly six assignments: Contributor and the constrained role-assignment right on each of the two groups, Storage Blob Data Contributor on the state container, and AcrPush on the registry (from the apply). Within the foundation group it can grant AcrPush or AcrPull to any principal, itself included; the worst case is registry push or pull. Whether the condition admits the foundation stack's two assignments and refuses others is shown only by the pipeline's own foundation apply (register 106).

## The dev pipeline's plan step

`azure-pipelines-dev.yml` stage `infra_plan`, new parameter `planMode` (`real` by default; `rehearsal` brings back the simulated plan for the gate scenarios):

- Terraform 1.17.1 is downloaded and its SHA-256 checked against the value from HashiCorp's published list.
- Bootstrap check 6 for `bakery-plan`: it lists its own role assignments (its object id from its own token; it has no Microsoft Graph permission) and fails unless they are exactly Reader on the subscription and Storage Blob Data Reader on the state container; then it tries to create a resource group, which must be refused with `AuthorizationFailed` (if it is not, the step deletes the group and fails).
- The plan: as `bakery-plan`, signed in by the connection's federated token, `-lock=false` (ADR-0020 decision 5), `-detailed-exitcode`. The registry, apps identity and tenant are read from the foundation's state outputs and the sign-in; the subscription, state account, deploy identity and the vault and Cosmos names are pipeline variables set in Azure DevOps.
- **The saved plan is not published** (the lead's decision, 2026-11-20; ADR-0020 decision 5 says the plan is published): a saved plan holds every input and refreshed attribute in clear text, sensitive ones included (register 214). `scripts/ci/plan-summary.mjs` publishes each changed resource's address and action, the names of changed outputs and the counts, checks them against the exit code and sets `hasChanges`. The plan's text output still goes to the run log, where Terraform masks sensitive values; the log names private resources and is readable only inside the private project (register 215).

Local checks: the script tests pass (61, including the plan summary's test that no key, name or id from a plan reaches the summary, and the pipeline structure tests, which now hold that the only connection is `bakery-plan`, used only in the plan stage, that every plan there is `-lock=false` and that nothing applies).

**The same step run locally, as the lead** (read-only, `-lock=false`; Git Bash with path conversion off, `jq` replaced by `node`, otherwise the step's commands): the foundation outputs were read from state; the dev stack planned `24 to add, 0 to change, 0 to destroy` (the Container Apps environment and seven apps, Cosmos with its database and five containers, Key Vault with three placeholder secrets and two role assignments, Log Analytics, the role-propagation wait); exit code 2; the summary listed the 24 and contained none of the private values that the plan's JSON contained. This proves the step's Terraform part with the lead's rights, not with `bakery-plan`'s.

The token decoding and the role query of the self-check were run against the lead's identity (two assignments found, role names resolved); the create probe was not, since the lead may create.

## Not yet run

- The plan step in Azure DevOps as `bakery-plan` (needs the pipeline variables, the branch pushed, and the lead permitting the connection for the pipeline on first use). Expected: check 6 passes; the plan shows 24 to add; `infra_apply` then stops at the `dev-infra` branch check when the run is on a branch other than `main`.
- `bakery-deploy`'s own check 6, which belongs in the approved apply stage.
- Whether `bakery-plan` can refresh an existing dev stack (register 213) and what the dev state holds (register 214): both need the first dev apply.
