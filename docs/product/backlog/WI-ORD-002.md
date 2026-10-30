> **Status:** Done · evidence: `services/ordering-service/src/Domain/Order.cs` and `OrderingService.Tests` (lifecycle, cancellation, events); lifecycle in `docs/architecture/order-lifecycle.md`

```
WI ID:               ORD-002
Title:                Order aggregate + lifecycle states
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text is in git history (`git log -- docs/product/backlog/WI-ORD-002.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
ADR-0001 and `data-model-api-contracts.md` define the `Order` shape and lifecycle; this item is the aggregate that implements state transitions and validation, fulfillment-agnostic per `ORD-004`'s seam.

**What exists** (built on `feature/slice-ordering`, 2026-10-28; 114 tests at the time, run locally and not on Azure)
- `Order`, `OrderLine` and events as data, in `services/ordering-service/src/Domain/`. The aggregate is in memory; persistence is `ORD-006` and publishing is `ORD-005`.
- **Statuses:** `Pending` (the customer building the order, with line and window edits), `Placed`, `Confirmed`, `InPreparation`, `ReadyForFulfillment`, `Completed`, `Cancelled`. Each transition is valid from exactly one status; any other call throws `InvalidOrderTransitionException`, and a failed transition changes nothing. `Completed` and `Cancelled` are final.
- **Cancellation** follows an actor and reason table (`docs/architecture/order-lifecycle.md`): the customer while `Placed` or `Confirmed`; the vendor from `Placed` (a decline) and from `Confirmed`, `InPreparation` or `ReadyForFulfillment`. There is no system actor; a response timeout is deferred.
- **`sequenceNumber`** counts the order's events, one per transition, so consumers see no gaps.
- **Events** are raised as data, not published. The order raises business facts and the seam event `OrderReadyForFulfillment`. `PickupWindowScheduled` and `OrderReadyForPickup` belong to `PickupFulfillment` (`ORD-003`) per ADR-0001 (open item 59). `OrderConfirmed` carries the fulfillment details for the strategy. The `OrderConfirmed`, `OrderPreparationStarted` and `OrderCancelled` payloads were added to `EventSchemas`.
- **Bounds (D-5):** 1 to 20 per line and 10 lines, enforced as placeholders. The pickup window is optional and stored opaquely.

**You do not need to know about**
- Persistence mechanics (`ORD-006`) and event publishing mechanics (`ORD-005`).

**Out of scope**
- Persistence, Stripe charge triggering (`ORD-001`, stubbed there), event-bus publishing, and `PickupFulfillment` (`ORD-003`).

**Acceptance criteria (as met)**
- `Order` carries `id, customerId, vendorId, lines, status, fulfillmentType, fulfillment details (including the pickup window), sequenceNumber, createdAt, updatedAt`.
- Only valid transitions are allowed; an invalid one throws.
- Each transition increments `sequenceNumber`.
- Each transition raises one in-memory event matching the payload shapes in `TOOL-001`.

**Changes from the original plan**
- `Pending` is a status, and there is no post-placement `Customize`, so `OrderCustomized` is not raised (it was in the plan's event list).
- Cancellation is not "any state to Cancelled": it follows the actor and reason table above and is safe from final states.
- `PickupWindowScheduled` and `OrderReadyForPickup` are not raised by the order; they belong to `PickupFulfillment`.
- Gaps found in the review with the lead are open items 51 to 60 in `docs/governance/open-items-register.md` (inventory, payment timing, vendor endpoints, timeouts, no-shows, refunds, schema overlap).

**Dependencies**
- Blocked by (done): `ORD-004`. Blocks (all since built): `ORD-005`, `ORD-006`, `ORD-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Interfaces consumed**: `FulfillmentType`/`FulfillmentDetails` (`ORD-004`)
**Events raised (not published here)**: `OrderPlaced`, `OrderConfirmed`, `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted`, `OrderCancelled`
**Data touched**: `orders` container (shape only; persistence is `ORD-006`)

**Open Points (working)**
*(none currently)*
