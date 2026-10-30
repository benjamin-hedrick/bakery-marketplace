# Delegation Packet 06 — FulfillmentStrategy Seam (ACL Boundary)

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

**Item(s) covered**: `WI-ORD-004` (solo — kept isolated because it's the one true blocking node for the entire Ordering track per `MASTER-BACKLOG-OUTLINE.md` and `local-demo-execution-plan.md`)
**Full spec**: `docs/product/backlog/WI-ORD-004.md` — condensed here; that file wins on conflict.
**AI-agent suitability**: Yes, no open judgment calls.
**Delegation wave**: independent of Packets 05 and 07 in this round — no shared code with either. Does not need `WI-AUTH-005` or `WI-DEV-002` to be built; this is pure interface/data-shape work.

## Why this is packaged alone, not paired

Everything else in `EPIC-ORDERING` (`ORD-002`, `ORD-003`) is blocked directly by this item. Shipping it alone, first, and reviewed, is what actually unblocks the rest of the Ordering track for the next wave — pairing it with something else would just delay that review.

## Build this

The seam ADR-0001 requires between the `Order` aggregate and any fulfillment strategy:

- `FulfillmentType` enum: `Pickup`, `Delivery` (Delivery unused in v1 but present so the type doesn't need to change later)
- A `FulfillmentDetails` shape whose internal content is strategy-specific (a discriminated shape or a strategy-tagged payload) — the `Order` aggregate stores it opaquely, never inspects it directly
- Order status vocabulary matching the glossary exactly: `Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` (or `Cancelled`) — fulfillment-agnostic naming, **not** `ReadyForPickup`
- The communication contract is events only: `OrderReadyForFulfillment`, `OrderFulfillmentCompleted` — no synchronous interface method a strategy implementation must call into Ordering

## Scope boundaries (read before touching code)

- **Do not** implement `PickupFulfillment` itself — that's `ORD-003`, a separate item that will build against this seam
- **Do not** implement any Delivery strategy — explicitly deferred (`EPIC-FULFILLMENT-EXT`)
- **You do not need** to know anything about delivery/dispatch's actual future implementation — this item only needs to not preclude it

## Where to look (pointers, not restated)

- `docs/architecture/adr/0001-fulfillment-strategy-extensibility.md` — the full seam design this item makes concrete
- `docs/architecture/ddd/glossary.md` — Order Status vocabulary, must match exactly
- `tools/BakeryMarketplace.EventSchemas/DomainEventPayloads.cs` — existing payload-record conventions to follow for any new payload shapes this item introduces

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`). No adapter/chaos pattern applies — this is a data/interface shape, exercised indirectly via `ORD-002`/`ORD-003`'s own tests once those are built.
