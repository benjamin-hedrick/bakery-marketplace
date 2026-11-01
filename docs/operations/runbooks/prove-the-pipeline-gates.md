# Procedure: prove the pipeline gates

> **Status:** Current · written 2026-10-31, run on Azure DevOps by the human lead 2026-10-31 to 2026-11-01: G1 to G8 all passed (G6 showed `sequential`). Result: [`gate-rehearsal-2026-11-01.md`](../../evidence/WI-DEP-001/gate-rehearsal-2026-11-01.md); it is the lead's report, without run numbers. The names of Azure DevOps settings were not compared line by line with this page, so correct it if your interface differs. Decision: ADR-0020. Pipeline: [`azure-pipelines-dev.yml`](../../../azure-pipelines-dev.yml).

**Purpose.** The dev pipeline will, in time, plan, apply, deploy and destroy real things behind manual approvals. Before any real step is added, this procedure proves that the gates do what the design says, using a pipeline that only prints. It creates no resource, uses no service connection and costs nothing. A gate is proved when a run that should stop, stops, and a run that should wait, waits.

**What this proves and what it does not.** It proves the approvals, the branch check, the lock, the typed confirmation, the skip-when-nothing-changed rule, and that pull requests cannot reach the dev pipeline. It does **not** prove that a service connection has the right permissions, that Terraform state works, that a plan is accepted by Azure, or that the destroy guard is right about a real plan (it is run on a fixture here). Each real step is rehearsed here first and then proved again with its first real run.

## Before you start (once)

1. The branch with `azure-pipelines-dev.yml` is merged to `main`.
2. In Azure DevOps, **Pipelines > Environments**, create three environments with no resource: `dev-infra`, `dev-app`, `dev-destroy`. **Create all three, with their checks, before the first run:** an environment name that does not exist is created automatically, without checks, the first time a run uses it.
3. On each, open **Approvals and checks** and add:
   - **Approvals**: you as approver. You are the only one, so allow approvers to approve their own runs (otherwise nothing can ever be approved).
   - **Branch control**: allowed branches `refs/heads/main`; enable "verify branch protection" only if it does not block you.
   - **Exclusive lock** (so only one run at a time can be in the environment).
4. **Pipelines > New pipeline**, existing YAML file `azure-pipelines-dev.yml` on `main`; name it `bakery-dev-operations`. Do not add a trigger in the interface.
5. Make a throw-away branch from `main` (for scenario G3).

## Scenarios

Run them in this order. Each says what to do and what a pass looks like. Record the run number and what you saw.

| ID | Do | A pass looks like |
|---|---|---|
| G1 | Run on `main`: action `deploy`, simulate changes on (the default). | `inputs` and `infra_plan` run. `infra_apply` **stops and waits** for approval at `dev-infra`. **Reject** it: the run fails there and `app_deploy` never starts. Run again, **approve**: the apply step prints its rehearsal line, then `app_deploy` **waits** at `dev-app`; approve; the run succeeds. |
| G2 | Run on `main`: `deploy`, simulate changes **off**. | `infra_plan` prints "no changes". `infra_apply` is **skipped** and nobody is asked. `app_deploy` still **waits** for approval, then succeeds. (This is the rule that an unchanged infrastructure needs no infrastructure approval.) |
| G3 | Run on the **throw-away branch**: `deploy`. | The run is stopped by the **branch control** check at `dev-infra` (the stage does not run its steps). If it runs through, the check is missing or wrong. |
| G4 | Run on `main`: action `destroy`, confirmation left at its default (`none`), then `prod`, then `DEV`. | `inputs` fails each time with "the confirmation must be exactly the environment name"; no later stage starts. |
| G5 | Run on `main`: `destroy`, confirmation `dev`. | `destroy_plan` runs the destroy guard on the fixture and prints "destroy guard: OK" with two resources. `destroy_apply` **waits** at `dev-destroy`; approve; it prints its rehearsal line. |
| G6 | Needs the pipeline with the `holdSeconds` parameter (merge the PR from G7 first). Start run 1 on `main`: `deploy`, simulate changes **on**, `holdSeconds` 90. Start run 2 the same way. Both will show **waiting for approval** at `dev-infra` at the same time: that is expected, because the exclusive lock is checked last, after approvals. **Approve run 1, then run 2 at once.** | Run 1 enters `infra_apply` and prints its start and finish times 90 seconds apart. Run 2, though approved, **does not start its step until run 1's stage has finished** (its start time is after run 1's finish time). Record which behaviour you saw: run 2 waits (`sequential`), or run 2 or run 1 is cancelled (`runLatest`, the default). Fail: the two start times overlap. |
| G7 | Open a pull request that edits `azure-pipelines-dev.yml` (not a draft). | The pull-request pipeline (`azure-pipelines.yml`) runs its checks as usual, and **no run of `bakery-dev-operations` appears** for it. Close the pull request. |
| G8 | Click **Run pipeline** (the dialog is the queue) and look at the action parameter's list. | Only `deploy` and `destroy` are offered. The run cannot be started by any trigger: open the pipeline, **Edit**, the **⋮** menu, **Triggers**; there is no CI or pull-request trigger and no schedule. (The pipeline's YAML has `trigger: none` and `pr: none`; the Triggers page may only say it is defined in YAML.) |

If any scenario does not pass, stop; the gate is not proved. Fix the check or the YAML (in a change that records why), and run the scenario again.

## Record the result

Write `docs/evidence/WI-DEP-001/gate-rehearsal-<date>.md`: for each scenario the run number, what happened, and a pass or fail; the date, who approved; and anything that differed from this page (then correct this page). Update the status line of this procedure to Current only when every scenario has passed and the page matches what you saw.

## After it passes

Add real steps one stage at a time, in this order, and **rehearse each change first** (run the scenarios that touch it, with the new step in rehearsal mode behind a parameter) before it does anything real: the Terraform plan step (a read-only connection), the apply of the foundation stack, the image build and push, the application deploy, the post-deploy smoke, the destroy plan with the real guard, the destroy. The first real run of each step is recorded in its own evidence file.

## What not to do

- Do not add a service connection to this pipeline until the step that uses it has been rehearsed.
- Do not rely on the YAML alone to protect a stage. A pull request can change the YAML; the environment checks are the control, and they live in the Azure interface.
- Do not approve a run you cannot explain. The approval is for the exact plan shown.

## Escalate when

A scenario cannot be made to pass, or an environment ran with no check. Stop adding real steps and record it in the open-items register.

## Last tested

2026-10-31 to 2026-11-01, by the human lead on Azure DevOps (G1 to G8 passed; see the evidence file above). Before that, the files it relies on were checked locally: the pipeline's structure and the shell logic of its steps (`scripts/ci/tests/pipeline-structure.test.mjs`) and the destroy guard (`scripts/ci/tests/destroy-guard.test.mjs`), recorded in `docs/evidence/WI-DEP-001/terraform-foundation-and-gate-rehearsal-2026-10-31.md`. That is not a run on Azure.
