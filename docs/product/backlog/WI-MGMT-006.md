> **Status:** Deferred · trigger: the lead decides to add management artifacts to the portfolio (deferred 2026-10-30)

```
WI ID:               MGMT-006
Title:                Hypothetical team structure and hiring plan
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Deferred
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Deferred together with `MGMT-003`.

**Context / Why**
If this product were staffed, what team would it need and in what order? A short hypothetical plan, clearly labelled as such, derived from the architecture (four services, two web apps, a BFF) and the risk register.

**Inputs / References**
- *Decisions*: ADR-0009 (four services), ADR-0013 (the BFF), `docs/management/risk-register.md`, `docs/management/budget-cost-estimate.md`

**You do not need to know about**
- Real salary or market data; none is used.

**Out of scope**
- Real recruitment, compensation, or labor cost estimates (`WI-MGMT-005` leaves labor cost open by design).

**Requirements / Acceptance Criteria**
- Teams or roles derived from the service and app boundaries, with the first hires in an order justified by the risk register.
- States that it is hypothetical and cites no real figures.

**Dependencies**
- Related: `MGMT-003`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the structure; any figures would need the lead.

**Open Points (working)**
- [ ] Whether to build it at all.
