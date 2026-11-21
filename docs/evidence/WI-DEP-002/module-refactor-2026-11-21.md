# The environment module refactor, proved against the dev state, 2026-11-21

> **Status:** Current · `WI-DEP-002` step 2a: the dev root's resources moved into `infra/modules/environment`, with `moved` blocks in `infra/environments/dev`. Checked locally and with a read-only plan against the live dev state; not yet applied by the pipeline.

## What changed

- `infra/modules/environment/` holds what `infra/environments/dev/` held (`main.tf`, `variables.tf`, `outputs.tf`, the two mocked-provider test files), plus a `versions.tf` that names the providers without configuring them. The module requires each root to state `environment`, `resource_group_name` and `host_environment`; the optional settings are `nullable = false`, so a root that passes `null` gets the module's default and does not repeat it.
- `infra/environments/dev/` keeps its backend and provider settings (`versions.tf`) and now has a module call with dev's values, the variables it takes from the pipeline, pass-through outputs under the same names, and 22 `moved` blocks (27 objects, counting each instance of the apps, the secrets and the budget).
- `scripts/ci/terraform-checks.mjs` checks the module on its own (with its tests) as well as each root. `chaos-not-deployed.test.mjs` now allows the chaos and deployment-environment settings only in the module, only as `var.environment`, and only the dev root may name itself `dev`. `plan-summary.mjs` records a moved resource as `move` with its old address (below).

## Checks

| Check | Result |
|---|---|
| `node scripts/ci/terraform-checks.mjs` (format; foundation, module and dev root: init without backend, validate; foundation and module tests with mocked providers) | 9 of 9 passed |
| `node --test scripts/ci/tests/*.test.mjs` | 141 of 141 passed |
| `terraform plan -lock=false -refresh=false -detailed-exitcode` of the dev root against the dev state (the lead's sign-in, read only, the plan stage's options) | `Plan: 0 to add, 0 to change, 0 to destroy`; 27 objects "has moved to module.environment..."; exit code 2 |
| `plan-summary.mjs` on that plan's JSON | 27 changes, all `move`, no output changes; agrees with exit code 2 |

The saved plan and its JSON (which hold values in clear text) were deleted straight after; neither left the lead's machine.

## Found and fixed on the way

- **A plan whose only changes are moves** exits with 2 (Terraform counts the state rewrite as a change), but `plan-summary.mjs` skipped every no-op entry, and a move is a no-op with a previous address. The first pipeline run after the refactor would have stopped at the plan stage with "terraform plan said changes (exit 2) but the plan lists none". It now keeps such an entry as `move` with the address it moved from, and compares moves after approval like any other change (a test covers it).
- **What the next dev run does:** its plan shows 27 moves; the infrastructure approval is asked for; the apply only rewrites the state's addresses. No resource in Azure changes. The `moved` blocks can be removed after that apply.

## Step 2b: the pipeline's stages in a template

- `pipelines/templates/environment-stages.yml` holds every stage that `azure-pipelines-dev.yml` held. Its parameters are the five run choices (passed through) and the environment's two connections and three approval environments; the stages name a connection or an approval environment only through them, and reach the Terraform install template by its path from the template's own folder.
- `azure-pipelines-dev.yml` keeps its header, triggers, run parameters, variables and pool, and calls the template with `bakery-plan`, `bakery-deploy`, `dev-infra`, `dev-app` and `dev-destroy`. Artifact names stay `dev-*` (to be parameterised with the UAT pipeline, step 8).
- **Equivalence, checked mechanically:** putting dev's values back into the template's parameters (and the old template path) gives the original `stages:` section byte for byte, before and after formatting; in the dev file's header only the "state of this file" paragraph changed (brought up to date: every stage has run in Azure, and the stages are now in the template).
- `pipeline-structure.test.mjs` reads the dev file and the template together; the checks on connections, approval environments and the Terraform template now check the parameters in the template and the values the dev file passes, plus a new check that every run parameter is passed through. 142 of 142 script tests pass.
- **Azure DevOps' own expansion (after the push, 2026-11-21):** a preview of the dev pipeline (expansion only, nothing runs; `az devops invoke --area pipelines --resource preview`) from `feature/dev-cold-start` and from `main`, for `deploy` and for `destroy`, real plan mode. Destroy: the two expanded pipelines are identical apart from comments. Deploy: identical apart from comments and one line, `DEPLOYED_WHERE=agent` on the smoke's suite command, which is the warm-up change made earlier the same day. Not yet run: the next dev run proves it.

## Not done here

- Everything after step 2.
