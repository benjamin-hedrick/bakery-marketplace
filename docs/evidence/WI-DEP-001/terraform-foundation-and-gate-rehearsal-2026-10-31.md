# WI-DEP-001: Terraform foundation stack, destroy guard and gate rehearsal pipeline

> **Status:** Evidence · written 2026-10-31 on the development machine (Windows 11, Docker Desktop 29.1.3; Terraform 1.13.5 and azurerm 4.81.0 in the pinned `hashicorp/terraform` image). Branch `feature/dev-environment`. **Nothing here has run on Azure or against an Azure account.** It shows what can be shown without one, and lists what cannot.

## What was built

| Piece | Where |
|---|---|
| Foundation stack: resource group, container registry (Basic, admin user off), AcrPush and AcrPull assignments by principal, an optional budget alert, outputs | `infra/foundation/` (backend left open, values passed at init; provider lock file for linux, windows and macOS arm) |
| Terraform checks runner (format of all of `infra/`, then init, validate and test per stack, in the pinned image) | `scripts/ci/terraform-checks.mjs`, run by a new `terraform` job in `azure-pipelines.yml` |
| Destroy guard (pure destroy, one resource group, nothing tagged persistent, typed confirmation, fail closed) | `scripts/ci/destroy-guard.mjs` |
| Rehearsal pipeline: the stages and environment gates of the real one, with steps that only print | `azure-pipelines-dev.yml` (its own pipeline; `azure-pipelines.yml` keeps its triggers and every job, plus the `terraform` job) |
| Procedures (drafts, not run) | `docs/operations/runbooks/prove-the-pipeline-gates.md`, `bootstrap-terraform-state.md` |

## What was run, and the result

| Check | Command | Result |
|---|---|---|
| Terraform: format, init, validate, test | `node scripts/ci/terraform-checks.mjs` | Passed: 4 steps; 6 plan-level tests with a mocked provider |
| Do the Terraform tests catch a wrong change? | Three deliberate edits to `main.tf` (SKU to Standard, admin user on, push role to Owner), one at a time | Each made the test step fail with the test's own message; reverted |
| Destroy guard and pipeline file tests | `node --test "scripts/ci/tests/*.test.mjs"` | 29 passed (13 guard, 11 file structure, 5 running the rehearsal steps' shell with the macros filled in) |
| Do those tests catch a wrong change? | Five deliberate edits to the guard (group check, persistent tag, pure-delete check, confirmation, unknown-group rule) and five to the pipeline file (confirmation, manual-only check, plan condition, environment of the destroy, simulated plan output) | Every edit made at least one test fail; reverted |
| Does the pipeline YAML parse? | PyYAML on both files (not part of the repository) | `azure-pipelines-dev.yml` first failed: an unquoted `: ` inside an echo step (Azure would also have refused it); fixed. Both files parse now. This is a syntax check, not Azure's validation |
| The usual gates | `node scripts/ci/node-gates.mjs --tests` | See the commit; run before it |

## What this does not show

- That Azure accepts the pipeline YAML (template expressions such as `dependencies.infra_plan.outputs['plan.plan.hasChanges']`, the `in(...)` condition on a skipped stage, the boolean parameter printed as `True`). Only a run can show it; the first rehearsal run is that test.
- That any environment check works. Approvals, branch control and the exclusive lock are set in the Azure interface; `prove-the-pipeline-gates.md` is the procedure that proves them.
- That the foundation stack's resources are accepted by Azure, that the registry name is free, the budget start date is valid, or that the provider behaves as the mock does. The mock returns whatever the code asked for; a real plan and apply are the test.
- That the destroy guard handles a real `terraform show -json` plan. Its fixtures were written by hand from the documented format. The first real destroy plan must be run through it and its output compared; register item 107.
- Terraform state, the pipeline identities and their permissions (`bootstrap-terraform-state.md`, not run; register item 106).
- Cost: the registry price (about $5 per month for Basic) is from memory and not checked.
