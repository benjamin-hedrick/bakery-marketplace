# Gate rehearsal: results reported 2026-10-31 and 2026-11-01

> **Current result (2026-11-01):** the eight gate scenarios G1 to G8 are reported passed by the lead on the rehearsal pipeline, which only prints; nothing was applied to Azure and no real plan was run through the destroy guard.

Procedure: [`prove-the-pipeline-gates.md`](../../operations/runbooks/prove-the-pipeline-gates.md). Reported by the human lead from Azure DevOps, who ran every scenario and approved every run; not observed by Claude. Run numbers were not tracked: some scenarios were run more than once, others passed first time, and the new pipeline had 14 runs in total at the time of this report. Individual run numbers are therefore not recorded here.

| ID | Result | What was seen |
|---|---|---|
| G1 | Pass | Reported as passed on 2026-10-31. Details not given. |
| G2 | Pass | Reported as passed on 2026-10-31. Details not given. |
| G3 | Pass | Reported as passed on 2026-10-31. Details not given. |
| G4 | Pass | Reported as passed on 2026-10-31. Details not given. |
| G5 | Pass | Reported as passed on 2026-10-31. Details not given. |
| G6 | Pass, `sequential` | The exclusive lock held. The two jobs ran one after the other and both completed. |
| G7 | Pass | Build "Feature/dev teardown #26" on the latest pull request was all green. The separate manual pipeline (`bakery-dev-operations`) did not run for it, which is the correct behaviour. |
| G8 | Pass | The run dialog offers the deploy and destroy options and the rehearsal options; `none` is present in the destroy input. No triggers. |

## Limits of this record

- G1 to G5 are the lead's report without per-scenario detail or run numbers. G6 to G8 carry a little more detail. Nothing here is a screenshot or a pipeline log.
- This proves the approvals, branch check, lock, typed confirmation, skip rule and trigger absence on a pipeline that only prints. It does not prove any service connection, Terraform state, a real plan, or the destroy guard on a real plan (see the procedure's "What this proves and what it does not").
