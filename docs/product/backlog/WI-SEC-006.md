> **Status:** In progress · step 1 built 2026-11-23 on `feature/pipeline-and-images`: the `audit` job in `azure-pipelines.yml` (the seven npm projects installed, the audit step `continueOnError`, the summary, SBOMs and raw output published as the `dependency-audit` artifact) and its structure test; **not yet run in Azure Pipelines**. Step 2 (blocking) waits for the lead to have seen it green on a few runs. Created from the lead's decision on register 162 point (3); split out of `WI-SEC-004`.

```
WI ID:                SEC-006
Title:                The dependency audit as a pipeline job, non-blocking first, then blocking
Type:                 Infra/Environment
Epic:                 EPIC-CI-CD
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 S
Verification class:   V1 (a pipeline job and its structure test; the proof is a pipeline run, which the lead starts). The classes are proposed in `docs/process/verification-policy.md` (register item 130).
```
ADRs and NFRs affected: ADR-0015 (Azure Pipelines is the only CI), `nfrs.md` section 3 (supply chain). No ADR changes.

**Context / Why**
`WI-SEC-004` built `scripts/ci/dependency-audit.mjs` and ran it once (2026-11-07). The audit is not a pipeline job, so nothing re-runs it (gap row `T-36` stays Partly). On 2026-11-23 the lead decided register 162 point (3): add the job in two steps, non-blocking first, blocking once it has run green a few times, with the policy proposed in the script header (exit 1 for a high or critical advisory in production npm dependencies or any vulnerable NuGet package; moderate development-tooling advisories are reported, not failed; exit 2 when a step could not run).

**Inputs / References**
- *Decisions*: register 162 (the lead's decision of 2026-11-23); ADR-0015.
- *Interfaces*: `scripts/ci/dependency-audit.mjs` (its exit codes and `--out`).
- *Environment/tooling*: `azure-pipelines.yml` (a shared file: one branch at a time), `docs/evidence/WI-SEC-004/dependency-audit-2026-11-07.md`.

**You do not need to know about**
- The Terraform pipelines (`pipelines/`, `azure-pipelines-dev.yml`) and the deployed environment.

**Out of scope**
- A container image scan: `WI-SEC-007`.
- Migrating `xunit` to `xunit.v3`: accepted as legacy by the lead on 2026-11-23 (register 162 point 2), not scheduled.
- Fixing any advisory the job finds: each is its own change.

**Requirements / Acceptance Criteria**
1. A job in `azure-pipelines.yml` runs `scripts/ci/dependency-audit.mjs` (with the SBOMs, or `--no-sbom` if the time is too long) after `npm ci` in each npm project, and publishes the summary as a pipeline artifact.
2. **Step 1, non-blocking:** the job's failure does not fail the pipeline (the step is marked to continue on error and the summary says what the exit code was). The first run's result is recorded in `docs/evidence/WI-SEC-006/`.
3. **Step 2, blocking:** after the lead has seen the job green on at least three runs, the job fails the pipeline on exit 1 and on exit 2. This is a separate commit, made when the lead says so.
4. A structure test in `scripts/ci/tests/pipeline-structure.test.mjs` pins the job and, in step 2, that it is not marked to continue on error; it fails without the job.
5. `docs/operations/scripts.md` and register 162 say which step the job is in. `T-36` in the gap catalog moves to Done only after step 2.

**Dependencies**
- Blocks: nothing.
- Blocked by: none.
- Can be worked in parallel with: `WI-SEC-007`, but both edit `azure-pipelines.yml`, so one branch at a time.

**Verification**
Class V1. The structure test and the Node gates run locally; the job itself runs only in Azure Pipelines. Report it as not run until the lead has run it.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full. Flag, do not choose: making the job blocking before the lead says so; changing the fail policy.

**Open Points**
- [ ] How many green runs count as "a few" before step 2: proposed three, the lead decides.
- [ ] Whether the SBOMs are worth their time on every run or only on a schedule: the lead decides after seeing the first run's duration.
