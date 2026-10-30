> **Status:** Deferred · trigger: with the public-readiness pass (register item 93) or when a deployment stage is added

```
WI ID:               SEC-004
Title:                Pipeline security checks and Terraform validation
Type:                 Document/Artifact
Epic:                 EPIC-CI-CD
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Deferred
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
