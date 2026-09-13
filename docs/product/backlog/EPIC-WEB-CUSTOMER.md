```
Epic ID:            EPIC-WEB-CUSTOMER
Title:               Customer-facing web app (web-customer)
Scope:               Catalog & Customization, Preferences & Dietary Safety, Ordering & Fulfillment (customer-facing UI only — backend logic lives in catalog-service/ordering-service)
Primary hat(s):      Engineering/Build, Architect
Goal:                Deliver a browsable, orderable customer experience against the already-built backend contracts (data-model-api-contracts.md), with dietary-safety information surfaced prominently per vision principle 1.
Related references:  ADR-0011 (frontend framework), ADR-0006 (auth), ADR-0008 (direct-to-service calls, no gateway locally), docs/architecture/data-model-api-contracts.md (catalog-service/ordering-service endpoints)
Constituent work items:
  - WI-WEB-001 (Service Implementation — shared scaffold + PKCE auth pattern) — shared with EPIC-QUEUE-DISPLAY
  - WI-CUST-002 (Service Implementation — browse/detail view)
  - WI-CUST-003 (Service Implementation — cart/checkout UI)
  - WI-CUST-004 (Service Implementation — order confirmation/status view)
Status:              Started (all 4 items detailed, none built yet)
```
