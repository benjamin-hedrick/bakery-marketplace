> **Status:** Deferred · trigger: deployment work (priority P4) starts; it needs the lead's approval for identity and credentials

```
WI ID:               DEP-001
Title:                Deployment path: images, deploy stage, dev environment, post-deploy smoke
Type:                 Document/Artifact
Epic:                 EPIC-CLOUD-INFRA
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Deferred
Size:                 L
```

> Created 2026-10-30 to track gaps found by the October 2026 documentation review so that the analysis is not repeated. Captured, not scheduled: no commitment, no delegation plan. The detail of each gap is in the gap catalog rows named below; this spec is the handle that shows it in `STATUS.md`.

**Context / Why**
Nothing is deployed. The path: a hosting decision for the web app and BFF, container images and a deploy stage for the four runtimes (with a time-zone data check), a Terraform dev environment with apply and destroy scripts and a cost guard, a post-deploy smoke running the journey against the deployed URL, a promotion checklist, and a public demo with teardown and a spending limit. Existing items cover parts: register 25 (hosting), 62 (credential), 71 (images), backlog N-02 and N-10.

**Inputs / References**
- *Gap catalog rows*: `T-60`, `T-61`, `T-62`, `T-64`, `T-65`, `G-C10`. See `docs/product/backlog/gap-catalog/` (the "Required content" and "Source" columns carry the detail).
- *References*: ADR-0013, ADR-0015, ADR-0018
- *References*: `docs/architecture/tech-stack.md`
- *References*: `docs/management/budget-cost-estimate.md`

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
Partial; identity and IAM changes need the lead's approval.

**Open Points (working)**
- [ ] Whether the lead wants this at all (the trigger is the lead's decision).
