> **Status:** Deferred · trigger: the lead picks up the architecture reference gaps

```
WI ID:               DOC-002
Title:                Architecture and contract reference gaps
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
Diagrams and references the review found missing after the container, request-path and component diagrams were written: an order lifecycle state diagram, an updated event flow, the auth flows, the cache layers, the CI pipeline, the data model split into built and planned (with the as-built part generated), and references for the GraphQL schema, events, configuration and auth (roles, policies, claims).

**Inputs / References**
- *Gap catalog rows*: `G-D07`, `G-D08`, `G-D09`, `G-D10`, `G-D12`, `G-D13`, `G-A03`, `G-A04`, `G-A05`, `G-A06`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: `docs/architecture/`
- *References*: `docs/architecture/data-model-api-contracts.md` (to be split)

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
Yes; every claim must be checked against the code it cites.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
