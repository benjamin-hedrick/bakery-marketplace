> **Status:** Deferred · trigger: the lead picks it up

```
WI ID:               EVID-001
Title:                Extract proof from specs into evidence records
Type:                 Document/Artifact
Epic:                 EPIC-REPO-OPS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The outcome notes of the large built items (`CAT-005`, `CAT-006`, `ORD-001`, `ORD-005`, `ORD-007`, `ORD-008`, `AUTH-006`, `CUST-003`, `CUST-004`) hold the best evidence of what was built and verified, inside spec files. Copy each into an evidence record with links, so proof does not live inside specs.

**Inputs / References**
- *Gap catalog rows*: `G-E02`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/evidence/`
- *References*: the outcome notes in the cited specs

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
Yes.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
