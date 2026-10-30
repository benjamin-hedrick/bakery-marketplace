> **Status:** Deferred · trigger: the baseline needs to be repeated or trended

```
WI ID:               QA-002
Title:                Quality metrics and scripted baselines
Type:                 Document/Artifact
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The 2026-10-30 baseline was run by hand. Missing: an aggregator over the per-run result files, a repeat-run job for the flake rate, a trend report, a scripted latency and throughput run for the NFR targets, a test-report template, quality trend charts, and the remaining theory tests (rework attributable to late decisions, bounded context versus the September packets, status checks catching a stale mention, the BFF and cache design against the NFR targets).

**Inputs / References**
- *Gap catalog rows*: `T-27`, `T-32`, `G-D18`, `G-T10`, `G-H04`, `G-H05`, `G-H06`, `G-H08`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/process/quality-gates.md` (evidence format)
- *References*: `docs/evidence/baseline-2026-10-30.md`
- *References*: `scripts/ci/summarize-results.mjs`

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
Yes for scripts; the theory tests need judgment.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
