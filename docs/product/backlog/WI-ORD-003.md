```
WI ID:               ORD-003
Title:                PickupFulfillment strategy implementation
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-28) — ADJUSTED (event layering, open item 59).** `PickupFulfillment` raises the pickup-specific events: `PickupWindowScheduled` on `OrderConfirmed` (which now carries the fulfillment details) and `OrderReadyForPickup` on `OrderReadyForFulfillment`. The Order no longer raises either. Completion: a *pickup confirmed* command (the vendor's `complete` endpoint, `WI-ORD-007`) is handled here and publishes `OrderFulfillmentCompleted`; the Order's handler calls `Complete`. See `docs/architecture/order-lifecycle.md`.
>
> **Reconciliation note (2026-10-26) — ADJUSTED.** (D-3) Adds a simple window source: `GET /ordering/pickup-windows?vendorId=` returns deterministic, clock-injected 15-minute slots within one configured set of hours, with a minimum lead time (D-8). Per-vendor hours, per-slot capacity and stock tied to a window are deferred. See `docs/architecture/first-slice-contract.md` (decisions D-n) and `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
ADR-0001 names exactly one concrete strategy for v1: pickup. This item implements it against the seam `ORD-004` defines — schedules a Pickup Window, transitions `ReadyForFulfillment → Completed` on pickup confirmation.

**Inputs / References**
- *Decisions*: ADR-0001 (PickupFulfillment's specific behavior)
- *Interfaces*: `FulfillmentType`/`FulfillmentDetails` (`ORD-004`)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: standard unit tests
- *Business context*: `docs/architecture/ddd/glossary.md` (Pickup Window)

**You do not need to know about**
- Any future Delivery strategy — this item proves the seam works for exactly one implementation, not a family of them

**Out of scope**
- Does not modify `ORD-004`'s interface shape
- Does not touch the Order aggregate's core state machine (`ORD-002`) beyond populating `FulfillmentDetails`

**Requirements / Acceptance Criteria**
- `PickupFulfillment` implements the strategy seam from `ORD-004`
- Schedules a `Pickup Window` (`{start, end}`) as its `FulfillmentDetails` payload
- Subscribes to `OrderReadyForFulfillment` (per ADR-0001's event-only communication contract) and, on customer pickup confirmation, triggers `OrderFulfillmentCompleted`
- Unit tests proving: a pickup window can be scheduled; confirming pickup transitions correctly; no direct/synchronous call path exists from Ordering into this strategy (communication is event-only, provable by the test setup using the event contract, not a direct method call)

**Dependencies**
- Blocked by: `ORD-004`
- Can be worked in parallel with: `ORD-002`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully specified by ADR-0001.

**Interfaces consumed**: `FulfillmentType`/`FulfillmentDetails` (`ORD-004`)
**Events published/consumed**: consumes `OrderReadyForFulfillment`, publishes `OrderFulfillmentCompleted`
**Data touched**: none directly (data lives in `FulfillmentDetails` on the `Order` aggregate)

**Open Points (working)**
*(none currently)*
