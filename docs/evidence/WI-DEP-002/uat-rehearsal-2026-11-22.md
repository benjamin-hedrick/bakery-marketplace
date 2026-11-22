# UAT gate rehearsal: results reported 2026-11-22

> **Current result (2026-11-22):** gate scenarios G1 to G6 and G8 of [`prove-the-pipeline-gates.md`](../../operations/runbooks/prove-the-pipeline-gates.md) are reported passed by the lead on `bakery-uat-operations` ([`azure-pipelines-uat.yml`](../../../azure-pipelines-uat.yml)) in plan mode `rehearsal`, with `uat-infra`, `uat-app` and `uat-destroy` in place of dev's environments. G7 is still to run. Nothing was planned, applied or deployed in Azure.

Work item: `WI-DEP-002`, step 7, bootstrap item 8 of [`uat-environment.md`](../../operations/runbooks/uat-environment.md). Reported by the human lead from Azure DevOps, who ran every scenario and approved every run; not observed by Claude, and no run numbers were recorded. Every run used `devBuild` 100, the dev run of 2026-11-22 ([`dev-roles-and-run-100-2026-11-22.md`](dev-roles-and-run-100-2026-11-22.md)).

| ID | Result | What was seen |
|---|---|---|
| G1 | Pass | Reported passed. Details not given. |
| G2 | Pass | Reported passed. Details not given. |
| G3 | Pass | Run on `throwaway/g3-uat`, a branch at the same commit as `main` (`1a8ff7b`), pushed for this test and deleted afterwards. Reported passed. |
| G4 | Pass | Reported passed, as part of "up to G6". Details not given. |
| G5 | Pass | Reported passed, as part of "up to G6". Details not given. |
| G6 | Pass | The exclusive lock held. The first attempt failed with an error the lead did not keep: the pipeline had been renamed during the run, to correct a typo in its name. Rerun with the correct name, it passed. |
| G7 | Not run | Planned with the next pull request that edits `azure-pipelines-uat.yml`: no run of `bakery-uat-operations` may appear for it. |
| G8 | Pass | Reported passed. Details not given. |

## What the rehearsal needed that the runbook did not say

- **The pipeline variables.** The rehearsal's `inputs` stage needs the variables of bootstrap item 7 even though no step uses a service connection; they had not been saved when the pipeline was registered. The agent listed the eleven plain values, each read back from Azure or from the foundation's outputs that day, and the lead set them with `BUDGET_CONTACT_EMAIL` as a secret.
- **`mockIssuer` on.** The run inputs refuse a UAT run with the mock issuer off until Entra exists (register 222), and the parameter defaulted to off. It now defaults to on (`WI-DEP-002`, answer 6 of 2026-11-22).

## Limits of this record

- The lead's report, without run numbers, logs or screenshots; G3 and G6 carry a little detail, the rest none.
- As the dev rehearsal of 2026-11-01 ([`gate-rehearsal-2026-11-01.md`](../WI-DEP-001/gate-rehearsal-2026-11-01.md)): it proves the approvals, the branch check, the lock, the typed confirmation, the skip rule and the absence of triggers on a pipeline that only prints. It proves no service connection, no state and no real plan.
- One real check did run: `inputs` runs `scripts/ci/promote-check.mjs` in rehearsal too, so every run that got past `inputs` had the check accept dev run 100 (a real deploy from `main` whose smoke passed), read with the run's own token. The fetch of run 100's digest record (`images`) is a rehearsal line and did not run.
