> **Status:** Done · the lead confirmed the north-star definition and set the targets 2026-11-06; baselines refreshed the same day (changes in the revision log of `docs/product/okrs.md`); revise after each slice

```
WI ID:               PROD-004
Title:                Success metrics and OKRs
Type:                 Document/Artifact
Epic:                 EPIC-PRODUCT-STRATEGY
Shared with epic(s):  none
Hat/Owner:            Digital Product Manager
Status:               Done
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Replaces the stub `docs/product/okrs.md`. Iterative: ship a first version, then revise after each slice.

> **Outcome note (2026-10-30).** First version written in `docs/product/okrs.md`: the five suggested themes, 17 key results (13 measured today, 4 not yet measurable), baselines from the evidence records and the repository. Targets and the north-star definition are proposals for the lead. The themes carried through unevenly: see the review note at the bottom of that file (O3 and O1 are the weak ones). Move to Done when the lead has set the targets; revise after each slice.

**Context / Why**
The vision names a north-star safety metric and nothing else. The repository exists as an experiment in building a small product with AI collaboration while keeping skills and technology current, so its objectives are both product-shaped and practice-shaped. Measures that already exist (test counts, timings, defects caught) give real baselines.

**Inputs / References**
- *Decisions*: `docs/product/vision.md` (the north-star safety metric)
- *Evidence*: `docs/process/quality-gates.md` (test baseline), `docs/evidence/baseline-2026-10-30.md`, `docs/evidence/test-reliability/findings.md`, `docs/evidence/slice-1/findings.md`
- *Process*: `docs/method/`

**You do not need to know about**
- Implementation detail of the measured systems.

**Out of scope**
- Dashboards or automated collection (a later item); targets that need deployed traffic.

**Requirements / Acceptance Criteria**
- At most five objectives. Suggested themes, to be edited: (1) dietary safety is first-class in the product; (2) the system is reproducible and its checks are trustworthy; (3) AI collaboration is controlled and its results are measured; (4) technology and skills stay current through small experiments; (5) decisions and changes stay traceable.
- Each objective has 2 to 4 key results with a number, a baseline taken from existing evidence where one exists, the way it is collected, and a "measured today" or "not yet measurable" mark.
- `docs/product/okrs.md` is replaced by the first version, with a dated revision section.
- The next review point is stated (after each slice).

**Dependencies**
- Blocked by: none. Related: `PLAN-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the draft; the lead sets the objectives and targets.

**Open Points (working)**
- [x] The north-star safety metric's exact definition: confirmed 2026-11-06 (KR1.3, with KR1.4 as a leading indicator).
- [x] Which experiments count as key results: the list is in KR4.2.
