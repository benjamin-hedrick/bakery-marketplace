> **Status:** Done · evidence: the Outcome note under this banner; `docs/process/test-strategy.md`, `playwright-guide.md`, `test-review-checklist.md`, `docs/product/backlog/TRACEABILITY.md`, `apps/web-customer/tests/e2e/accessibility.spec.ts`

```
WI ID:               QA-001
Title:                Test strategy and guides
Type:                 Document/Artifact
Epic:                 EPIC-QUALITY-EVIDENCE
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

> **Outcome note (2026-10-30).** All six rows are Done. The test strategy (layers, what each proves and does not, what is deliberately not tested, gates as pass or fail), the Playwright guide, the test-review checklist, a generated traceability table with a check (`scripts/docs/traceability.mjs`, in `node-gates` and the `docs` pipeline job: as generated on 2026-10-30, of 51 Done work items 26 are named by a test file, 15 by an evidence record, 16 by neither, mostly documents) and an accessibility smoke with axe-core (5 scans; the first run found a missing document language and two missing page titles, fixed). One dev dependency was added: `@axe-core/playwright` 4.14.0 (MPL-2.0). Changes from the original plan: none to scope. The mock-backed suite is now 62 tests; the real-stack journeys (21) and all Node gates pass.

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
- [x] Whether the lead wants this at all (the trigger is the lead's decision). **Resolved:** the lead picked it up; see the banner for what is done and what remains.
