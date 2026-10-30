> **Status:** Deferred · trigger: the lead picks up the method documents (suggested: after the review pull request merges)

```
WI ID:               DOC-001
Title:                Method documents, templates, checklists and standards not yet written
Type:                 Document/Artifact
Epic:                 EPIC-REPO-OPS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The review found practices that are used but not written down: the reconciliation practice, decisions and governance, the outcome-note, reconciliation-record and evidence-record templates, a richer ADR template, a pre-PR checklist, a new-ADR checklist, an AI-collaboration review checklist, and the standards for test determinism, telemetry privacy, error and idempotency conventions and ID naming. Some are partly covered by `docs/method/` already; the rows say which.

**Inputs / References**
- *Gap catalog rows*: `T-14`, `T-16`, `G-C03`, `G-C04`, `G-C09`, `G-T02`, `G-T03`, `G-T04`, `G-T05`, `G-S03`, `G-S04`, `G-S07`, `G-S08`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/method/`
- *References*: `docs/architecture/adr/template.md`
- *References*: `CLAUDE.md` (marking its rules is register item 94)

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
Yes for drafting from the cited sources; the standards are guided defaults the lead approves.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
