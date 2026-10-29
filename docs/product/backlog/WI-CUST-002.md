```
WI ID:               CUST-002
Title:                Listing browse + detail view
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

> **Update (2026-10-28):** stock states (in stock, low, sold out) on the list and detail pages and the order controls (`S1-03`, `S1-05`) are built; see `WI-CUST-003.md`.

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements (browse/detail, allergy flags and modifiers surfaced prominently) are retained. **Implementation changes**: a Next.js page rendered with SSR (public, no token), with data from the GraphQL BFF via Relay (ADR-0012/0013), and HTTP cache policy per ADR-0014. **Dependencies change**: blocked by `WI-PORT-002` and `WI-PORT-007` instead of `WI-WEB-001` (superseded). The first listing read path is proven by `WI-PORT-002`; this item completes the full view. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
`CAT-001` provides listing CRUD with allergy flags/modifiers; nothing yet renders it for a customer. Per vision principle 1, allergy/dietary information must be surfaced prominently at browse and detail views, not buried — this is the direct UI-layer enforcement of that principle.

**Inputs / References**
- *Decisions*: vision principle 1 (dietary safety first-class), `docs/architecture/data-model-api-contracts.md` (`GET /catalog/listings`, `GET /catalog/listings/{id}`)
- *Interfaces*: `WI-WEB-001`'s scaffold/auth wrapper (must exist first)
- *Environment/tooling*: not applicable beyond `WEB-001`
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (Listing, Modifier, Allergy Flag field names — match exactly)

**You do not need to know about**
- Search/ranking logic (`EPIC-SEARCH`) — this item is plain browse/detail, not ranked search
- Cart/checkout — separate item (`CUST-003`)

**Out of scope**
- Does not implement search/filter by dietary preference (`SRCH-001`, separate epic)
- Does not implement sponsored-placement blending (`SRCH-002`)

**Requirements / Acceptance Criteria**
- Listing grid/browse view against `GET /catalog/listings`
- Detail view against `GET /catalog/listings/{id}`
- Allergy flags and modifiers visible on both the list card and the detail view — not a secondary tab or collapsed section
- Loading/empty/error states handled explicitly, not left blank on failure

**Dependencies**
- Blocks: `CUST-003` (checkout needs a listing to add to cart)
- Blocked by: `WI-WEB-001`
- Can be worked in parallel with: `QUE-002`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing API contract and vision principle 1.

**Open Points (working)**
*(none currently)*
