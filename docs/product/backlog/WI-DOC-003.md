> **Status:** Deferred · trigger: a second screen or app is added, or the lead picks it up

```
WI ID:               DOC-003
Title:                Web data-fetching guide and the add-a-screen checklist
Type:                 Document/Artifact
Epic:                 EPIC-FRONTEND-QUALITY
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 M
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
The rules for server versus client rendering, the Relay store, loading and error conventions, when GraphQL and when REST, and the three cache layers are spread over ADR-0012, 0013 and 0014 and the web app's README. A guide and a checklist for adding a screen or field, and one table of the error taxonomy across REST, the BFF and the UI.

**Inputs / References**
- *Gap catalog rows*: `T-26`, `G-A07`, `G-C08`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: ADR-0012, ADR-0013, ADR-0014
- *References*: `apps/web-customer/README.md`

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
