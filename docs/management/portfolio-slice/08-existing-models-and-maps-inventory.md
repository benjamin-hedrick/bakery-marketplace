# Existing models and maps to reuse

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

The repository already contains domain models and several architecture maps. Do not start by redrawing them from scratch. Inspect these sources, identify inconsistencies, and extend only where the chosen frontend/BFF boundary or first-slice implementation genuinely requires it.

| Existing artifact | What it provides | How it should be used |
|---|---|---|
| `docs/architecture/data-model-api-contracts.md` | Concrete proposed `Listing`, `PreferenceProfile`, `Order`, `OrderStatusView`, `VendorProfile`, `Review`, and `Payout` shapes; proposed C# service endpoints and event ownership | Primary starting point for field/API mapping; verify actual implementation and note unresolved policies |
| `docs/architecture/ddd/glossary.md` | Shared domain terms and lifecycle vocabulary | Keep naming consistent across REST, GraphQL, UI, tests, and docs |
| `docs/architecture/ddd/event-storming.md` | Business process flows from commands to aggregates, events, policies and read models | Use for order lifecycle and future event-driven boundaries; don't invent a different flow in the BFF |
| `docs/architecture/ddd/bounded-contexts.md` | Core/supporting/generic context boundaries | Preserve ownership and avoid service sprawl |
| `docs/architecture/c4/context.md` | System context and actors/external dependencies | Update if the new client/BFF interaction materially changes the view |
| `docs/architecture/c4/container.md` | Existing app/service/data/event container map and current service ownership | Best starting point for a revised technical/container map including Next.js and GraphQL BFF |
| `docs/architecture/capability-map.md` | Business capability view and relationship to contexts/services | Retain as business-facing map; it does not need to mirror every new technical component |
| `docs/architecture/adr/0009-bounded-context-service-mapping.md` | Decision assigning contexts to catalog, ordering and admin services | Authoritative service-boundary decision unless superseded through a new ADR |
| `docs/architecture/adr/0002-cache-strategy.md` plus `docs/product/backlog/EPIC-CACHING.md` and `WI-CACHE-*` | Existing server cache abstractions, provider decisions, tests and cache work | Retained as layer 1 of ADR-0014's three-layer policy; don't duplicate or silently cancel existing work |
| `docs/product/backlog/WI-CAT-001.md`, `WI-ORD-001.md`–`WI-ORD-006.md`, `WI-DEV-004.md`, `WI-WEB-001.md` | Existing detailed backlog requirements for listing, checkout/order lifecycle, seed fixtures and web work | Reuse dependencies/acceptance criteria; mark overlapping/new work as refinement or supersession, not a parallel competing backlog |

## Mapping artifact to produce

For the first slice, produce a small operation matrix and a sequence diagram showing:

`Customer browser → Next.js page/Relay → GraphQL BFF → catalog-service / ordering-service → repository`

Show which data can be fetched in parallel, where validation happens, which service owns each field/rule, how failures map back to GraphQL, and where trace context flows. Only show the event backbone if the actual first-slice path uses it. Do not imply that a proposed container or endpoint is already implemented.
