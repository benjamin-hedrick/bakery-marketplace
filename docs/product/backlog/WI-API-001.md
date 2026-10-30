> **Status:** Deferred · trigger: the services' public surface needs a stable specification (before a second consumer or a deployment)

```
WI ID:               API-001
Title:                Machine-readable API specification and contract tests
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
No OpenAPI or equivalent exists for the catalog and ordering services; only the BFF has a schema file. A reference per endpoint (method, path, policy, request, success, errors, idempotency, source file), a machine-readable specification (generated if .NET 10 supports it, otherwise hand-written), and a contract test that the BFF's REST clients match it.

**Inputs / References**
- *Gap catalog rows*: `T-25`, `G-A01`, `G-A02`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: the endpoint list in `docs/evidence/facts-sheet-2026-10-29.md`
- *References*: `docs/architecture/first-slice-contract.md` sections 4, 6 and 8

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
Partial; the generated route needs a check of what .NET 10 supports.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
