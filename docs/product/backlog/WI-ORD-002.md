> **Outcome note (2026-10-28):** built on `feature/slice-ordering`: `services/ordering-service/src/Domain/` (`Order`, `OrderLine`, events as data) and 153 tests in `services/ordering-service/tests/OrderingService.Tests` (run locally; not run on Azure). **The lifecycle differs from the acceptance criteria below** after a review with the human lead, recorded in `docs/architecture/order-lifecycle.md`:
> - `Pending` (the customer building the order) is a status, with line and window edits; there is no post-placement `Customize`, so `OrderCustomized` is not raised.
> - Cancellation is not "any state": it follows an actor/reason table (customer through Confirmed, vendor from Placed on; no system actor, a timeout is deferred) and is final-state safe. `OrderConfirmed`, `OrderPreparationStarted` and `OrderCancelled` payloads were added to `EventSchemas`.
> - `sequenceNumber` counts events, not transitions (`Confirm` raises two when a window exists), so consumers see no gaps.
> - D-5 bounds (1-20 per line, 10 lines) are enforced as placeholders; the pickup window is optional and stored opaquely.
> Gaps found while reviewing are open items 51 to 60 in `docs/governance/open-items-register.md` (inventory, payment timing, vendor endpoints, timeouts, no-shows, refunds, schema overlap). Not done: persistence (`ORD-006`), publishing (`ORD-005`), checkout (`ORD-001`), windows (`ORD-003`).

```
WI ID:               ORD-002
Title:                Order aggregate + lifecycle states
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
ADR-0001 and `data-model-api-contracts.md` define the `Order` shape and lifecycle; this item is the actual aggregate implementing state transitions and validation, fulfillment-agnostic per `ORD-004`'s seam.

**Inputs / References**
- *Decisions*: ADR-0001 (fulfillment-agnostic status vocabulary), `data-model-api-contracts.md` (`Order` document shape)
- *Interfaces*: `FulfillmentType`/`FulfillmentDetails` (`ORD-004`)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: standard unit tests — no adapter/chaos pattern applies to a pure aggregate
- *Business context*: `docs/architecture/ddd/glossary.md` (Order, Line Item, Order Status)

**You do not need to know about**
- Persistence mechanics (`ORD-006`, separate) — this item is the in-memory aggregate and its transition rules
- Event publishing mechanics (`ORD-005`, separate) — this item raises domain events as data, doesn't publish them

**Out of scope**
- Does not implement `CosmosRepository`-backed persistence (`ORD-006`)
- Does not implement Stripe charge triggering (`ORD-001`, stubbed there) or event-bus publishing (`ORD-005`)
- Does not implement `PickupFulfillment` (`ORD-003`) — the aggregate only stores `FulfillmentDetails` opaquely

**Requirements / Acceptance Criteria**
- `Order` aggregate matches `data-model-api-contracts.md`'s shape: `id, customerId, vendorId, lineItems[], status, fulfillmentType, pickupWindow, sequenceNumber, createdAt, updatedAt`
- Valid transitions only: `Placed → Confirmed → InPreparation → ReadyForFulfillment → Completed`, or any state `→ Cancelled` — an invalid transition throws, doesn't silently no-op
- Each transition increments/validates `sequenceNumber` (per-aggregate ordering, per ADR-0003) so downstream consumers can detect out-of-order delivery
- Raises an in-memory domain event object per transition (not yet published — `ORD-005`'s job) matching the payload shapes already defined in `TOOL-001`

**Dependencies**
- Blocks: `ORD-005`, `ORD-006`, `ORD-001`
- Blocked by: `ORD-004`
- Can be worked in parallel with: `ORD-003`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully specified by ADR-0001 plus the existing data contract and event payload docs.

**Interfaces consumed**: `FulfillmentType`/`FulfillmentDetails` (`ORD-004`)
**Events published/consumed**: raises (doesn't publish) `OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted`
**Data touched**: `orders` container (shape only — persistence is `ORD-006`)

**Open Points (working)**
*(none currently)*
