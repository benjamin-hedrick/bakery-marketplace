> **Status:** In progress · the dependency audit and SBOM part is built and run locally (2026-11-07: `scripts/ci/dependency-audit.mjs`, `docs/evidence/WI-SEC-004/`); remaining: `G-E06` (Terraform validate and plan of the Key Vault module), a pipeline job for the audit (needs the lead's decision, register 162), and a container image scan

```
WI ID:               SEC-004
Title:                Pipeline security checks and Terraform validation
Type:                 Document/Artifact
Epic:                 EPIC-CI-CD
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In progress
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The pipeline has no dependency audit, secret scan or software bill of materials, and the Key Vault Terraform module has never been validated or planned. Record the outputs of an audit and a scan of the files and history, and of `terraform validate` and `plan` (no apply).

**Inputs / References**
- *Gap catalog rows*: `T-36`, `G-E06`, `G-E09`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `azure-pipelines.yml`
- *References*: `infra/modules/key_vault`
- *References*: register item 93

**You do not need to know about**
- Anything outside the rows named above.

**Out of scope**
- Scheduling and delegation; any other gap.

**Requirements / Acceptance Criteria**
- Every row named above has State Done (or Dropped, with the reason) in the gap catalog, pointing at what was produced.
- Anything found while doing it and not fixed is recorded in the register in the same change.

**Dependencies**
- Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the pipeline steps; reading the scan results is a human check.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).

**As built (2026-11-07, the lead asked for the audit and SBOM)**
- `scripts/ci/dependency-audit.mjs`: `npm audit --json` of the six npm projects (all dependencies and `--omit=dev`), `dotnet list package --vulnerable --include-transitive` and `--deprecated` over the root solution, CycloneDX 1.6 SBOMs (`@cyclonedx/cyclonedx-npm@6.0.1` and the `CycloneDX` .NET tool 6.3.1, both pinned) for the four npm apps and services and the four .NET services, and a summary. Policy proposed in the script header (exit 1 for a high or critical advisory in production npm dependencies or any vulnerable NuGet package; moderate dev-tooling advisories are reported, not failed; exit 2 when a step could not run, because an audit that did not run is not a pass). The policy is the lead's decision.
- First run: `docs/evidence/WI-SEC-004/dependency-audit-2026-11-07.md` (summary, how to read it), `sbom/` (eight SBOMs), `raw/` (the tools' own output). Result: no critical or high advisory; 25 moderate (minimatch and glob, in ESLint tooling and Expo's build tooling); three deprecated test packages (`xunit` 2.5.3, legacy). Nothing was upgraded.
- Gap rows: `G-E09` Done (a container image scanner was not run); `T-36` stays Partly because the audit is not a pipeline job yet. `G-E06` is not done.
