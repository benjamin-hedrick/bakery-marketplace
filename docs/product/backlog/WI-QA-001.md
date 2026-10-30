> **Status:** Deferred · trigger: the lead picks up the test strategy

```
WI ID:               QA-001
Title:                Test strategy and guides
Type:                 Document/Artifact
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The test layers, what each proves, what is deliberately not tested and the gates as pass/fail policy exist as pieces in `quality-gates.md` and the October plans. Missing: a test strategy, a Playwright framework guide (structure, fixtures, hook gating, determinism rules), a test-review checklist, a traceability table from work item to tests to evidence, a test-layers diagram and an accessibility smoke.

**Inputs / References**
- *Gap catalog rows*: `T-30`, `T-31`, `T-33`, `G-D14`, `G-C07`, `G-E08`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/process/quality-gates.md`
- *References*: `docs/management/portfolio-slice/02-vertical-slice-and-quality.md`
- *References*: `docs/evidence/test-reliability/findings.md`

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
Yes for drafting; the accessibility smoke is code.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
