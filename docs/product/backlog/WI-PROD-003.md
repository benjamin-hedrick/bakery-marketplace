> **Status:** Proposed · decision: the commission percentage and ad revenue split are business assumptions the lead sets

```
WI ID:               PROD-003
Title:                Monetization model
Type:                 Document/Artifact
Epic:                 EPIC-PRODUCT-STRATEGY
Shared with epic(s):  EPIC-ADVERTISING (listed there as ADV-002)
Hat/Owner:            Digital Product Manager
Status:               Proposed
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Cross-listed with `ADV-002`; this spec is the single home.

**Context / Why**
How would the product earn money? The design already assumes a commission taken on each order (ADR-0005: Stripe Connect with an application fee) and a simple sponsored-placement flag (no bidding engine). A one-page model makes the assumptions explicit.

**Inputs / References**
- *Decisions*: ADR-0005, `docs/product/scope.md` (sponsored placement is MVP-lite)
- *Business context*: `docs/product/vision.md`

**You do not need to know about**
- The payment integration (`PAY-001`) or the ad flag's implementation.

**Out of scope**
- Pricing tests, forecasts and tax or legal treatment (`GOV-002`).

**Requirements / Acceptance Criteria**
- Revenue streams named (commission, sponsored placement), each with the assumption behind it and where the system supports it today.
- A worked example at the target load in `docs/architecture/nfrs.md` (200 orders a day), clearly labelled illustrative.
- Every number is an assumption and says so.

**Dependencies**
- Related: `PROD-002`, `ADV-002`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Partial. Drafting yes; the assumptions are the lead's.

**Open Points (working)**
- [ ] The commission percentage and the sponsored-slot price to illustrate with.
