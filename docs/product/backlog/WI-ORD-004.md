> **Status:** Done · evidence: `services/ordering-service` (the fulfillment seam) and its tests

```
WI ID:               ORD-004
Title:                FulfillmentStrategy interface (ACL boundary)
Type:                 Interface/Contract
Epic:                 EPIC-ORDERING
Shared with epic(s):  EPIC-FULFILLMENT-EXT (the seam this ADR-0001 extension point plugs into)
Hat/Owner:            Architect, Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0001 requires the Order aggregate to stay fulfillment-agnostic — it owns a `FulfillmentType` and a strategy-specific `FulfillmentDetails` value object, and communicates with any concrete strategy only through published events, never a direct call. This item defines that seam in real C# before the aggregate (`ORD-002`) or the concrete pickup strategy (`ORD-003`) are built, since both depend on its shape being frozen first.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0001-fulfillment-strategy-extensibility.md` (the full seam design), ADR-0010 (C#/.NET)
- *Interfaces*: none consumed — this item defines the boundary itself
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable — this is a data/interface shape, tested indirectly via `ORD-003`'s implementation tests
- *Business context*: `docs/architecture/ddd/glossary.md` (Order Status vocabulary)

**You do not need to know about**
- Delivery/dispatch's actual future implementation — this item only needs to not preclude it, per ADR-0001

**Out of scope**
- Does not implement `PickupFulfillment` itself (`ORD-003`)
- Does not implement any Delivery strategy — explicitly deferred (`EPIC-FULFILLMENT-EXT`)

**Requirements / Acceptance Criteria**
- `FulfillmentType` enum (`Pickup`, `Delivery` — Delivery unused in v1 but present so the type doesn't need to change later)
- A `FulfillmentDetails` shape whose internal content is strategy-specific (e.g., a discriminated shape or a strategy-tagged payload) — the Order aggregate stores it opaquely
- Order status vocabulary matches glossary exactly: `Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed` (or `Cancelled`) — fulfillment-agnostic naming, not `ReadyForPickup`
- Communication contract stated as events only (`OrderReadyForFulfillment`, `OrderFulfillmentCompleted`) — no synchronous interface method a strategy implementation must call into Ordering

**Dependencies**
- Blocks: `ORD-002`, `ORD-003`
- Blocked by: none
- Can be worked in parallel with: `CAT-001`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully specified by ADR-0001; no open judgment calls.

**Interface signature/shape**: as described above, per ADR-0001
**Contract test cases**: none directly — exercised via `ORD-002`/`ORD-003`'s own tests
**Chaos scenarios**: not applicable

**Open Points (working)**
*(none currently)*
