> **Status:** 3 of 9 items done (CUST-005, CUST-006 and CUST-008 Ready, CUST-007 In review, MOB-001 In review, MOB-002 Ready; WEB-001 is superseded and not counted)

```
Epic ID:            EPIC-WEB-CUSTOMER
Title:               Customer-facing web app (web-customer)
Scope:               Catalog & Customization, Preferences & Dietary Safety, Search & Discovery, Ordering & Fulfillment (customer-facing UI only — backend logic lives in catalog-service/ordering-service)
Primary hat(s):      Engineering/Build, Architect
Goal:                Deliver a browsable, orderable customer experience against the already-built backend contracts (data-model-api-contracts.md), with dietary-safety information surfaced prominently per vision principle 1 — including, as of Batch 6, actually letting a customer set their own preferences and see them reflected while browsing, not just displaying generic allergen flags.
Related references:  ADR-0011 (frontend framework), ADR-0006 (auth), ADR-0008 (direct-to-service calls, no gateway locally), docs/architecture/data-model-api-contracts.md (catalog-service/ordering-service endpoints), docs/product/backlog/docs/product/demo-milestones.md (M3/M4 — this epic spans both)
Constituent work items:
  - WI-WEB-001 (Service Implementation — shared scaffold + PKCE auth pattern) — shared with EPIC-QUEUE-DISPLAY
  - WI-CUST-002 (Service Implementation — browse/detail view)
  - WI-CUST-003 (Service Implementation — cart/checkout UI)
  - WI-CUST-004 (Service Implementation — order confirmation/status view)
  - WI-CUST-007 (Service Implementation — customer order history list) — split out of CUST-004, 2026-10-30
  - WI-CUST-005 (Service Implementation — preferences/dietary-profile UI) — shared with EPIC-PREFERENCES, added 2026-09-14 (Batch 6, M4)
  - WI-CUST-006 (Service Implementation — personalized allergen highlighting on browse) — shared with EPIC-SEARCH, added 2026-09-14 (Batch 6, M4)
  - WI-CUST-008 (Service Implementation — allergens in the cart and at checkout) — shared with EPIC-PREFERENCES, added 2026-11-04
Status:              3 of 8 items done (CUST-005, CUST-006 and CUST-008 Ready, CUST-007 In review, MOB-001 Ready; WEB-001 is superseded and not counted)
```

> **Reconciliation note (2026-10-26).** ADR-0012 (Next.js Pages Router + SSR) supersedes ADR-0011, and ADR-0013 routes all browser data through a GraphQL BFF via Relay. Within this epic: `WI-WEB-001` is **SUPERSEDED** by `WI-PORT-001`/`WI-PORT-002`; `WI-CUST-002`–`006` are **ADJUSTED** (requirements retained; implementation and dependencies change, see each file's note). The epic's goal is unchanged. The "Related references" above (ADR-0011; ADR-0008 direct-to-service calls) are historical. Current references: ADR-0012, ADR-0013, ADR-0014, ADR-0006 (unchanged). See `docs/product/backlog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.
