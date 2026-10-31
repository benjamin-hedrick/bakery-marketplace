> **Status:** In review · decision: the cold run, the stranger test and the reading-time check (rows `G-E05`, `G-H07`, `G-H09`) need the lead; the rest is built

```
WI ID:               DEMO-001
Title:                Demo path: script, checklist, topology and a cold run
Type:                 Document/Artifact
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               In review
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

> **Outcome note (2026-10-30).** Built: `scripts/dev/demo.mjs` (start, warm, guide, stop; run once, 87 s, clean stop), `scripts/dev/capture-journey.mjs` and five screenshots, and `docs/operations/demo.md` with the checklist, the topology diagram and a troubleshooting table. Rows `T-03`, `T-06`, `G-D11` and `G-C06` are Done. Not done, and they need a person: a run on a machine with nothing cached (`G-E05`), a stranger following the page (`G-H07`) and timing a visitor to the main evidence (`G-H09`). Found and recorded: the warm-up does not remove the 7 s first checkout (register 98) and the web app is unstyled (register 97). Changes from the original plan: the script does not place a warm-up order, because that would consume stock and leave an order behind.

**Context / Why**
Slice 1 can be run by following `docs/operations/local-dev.md`, which was verified in a fresh clone with warm caches. What is missing is a one-command demo that starts the stack, warms it (the first request on a cold stack is slow), prints the URL and the mock login users and stops on request; a short recording or screenshots of the journey; a demo checklist; a topology diagram of what runs where; a run on a machine with nothing cached; and a stranger following the README.

**Inputs / References**
- *Gap catalog rows*: `T-03`, `T-06`, `G-D11`, `G-C06`, `G-E05`, `G-H07`, `G-H09`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/operations/local-dev.md`, `scripts/ci/skeleton-smoke.mjs`
- *References*: the cold-start finding in `docs/evidence/slice-1/findings.md`

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
Yes for the script, checklist and diagram; the cold run and the stranger test need a person.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
