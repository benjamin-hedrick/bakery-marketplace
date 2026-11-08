> **Status:** Done · evidence: the Outcome note under this banner; `services/ordering-service` (`Persistence/VendorOrder*.cs`), `services/graphql-bff`

> **Outcome note (2026-11-02):** built as part of `N-03` and `N-04` on `feature/stock-outbox-hardening` and `feature/vendor-order-detail`, under the name **vendor order read model**. The container is `vendor-orders`, partitioned by `/vendorId` (not `order-status-readmodel`); it is fed by the six Order events through `VendorOrderSubscriptions` and `VendorOrderProjection`, and read through `GET /ordering/vendor/orders` (the list) and `GET /ordering/vendor/orders/{id}` (one order), with the BFF's `vendorOrders` and `vendorOrder` queries on top. The service never reads `orders` for the list or the single read. Tests: `VendorOrderProjectionTests` (including repeated and out-of-order events), `VendorOrderApiTests`, `CosmosVendorOrderTests` (the real Cosmos emulator), and the BFF's `vendor-orders.test.ts`. Evidence of the emulator and Redis runs is in register items 76, 112 and 113.
>
> **Changes from the original plan:**
> - **No event-id dedupe store.** A repeated or late event is harmless without one: the status only moves to an event with a higher `sequenceNumber`, and the facts only one event carries (totals, window, reason) are filled in and never cleared, so applying an event twice, or out of order, ends in the same state. The 48-hour dedupe store (`ICacheProvider`) was therefore not built.
> - **The endpoint is `GET /ordering/vendor/orders`, not `GET /ordering/orders?vendorId=`.** The vendor id always comes from the token (never from a query value a caller could change), so ownership (ADR-0006) holds by construction. It lists newest change first, optionally by status (`active` or one status), paged by a cursor.
> - **The customer is not named.** `customerName` stays out (the open point below): the view carries a short **reference** derived from the order id (`OrderReference`) to read out or match on a screen. Item 114 records that a customer also cannot send free text.
> - **Lines are ids in the store and names at read.** `OrderPlaced` now also carries the requested pickup window and instructions, and the lines are kept as ids; the names come from `ListingNameCache` (register item 113), because the catalog owns them.
> - **Added:** `VendorId` and `CustomerId` on the order lifecycle events, so a consumer that keys by vendor needs no call back to ordering.

```
WI ID:               QUE-001
Title:                Order-status read-model (event-fed, not direct query)
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

> **Requirements rewritten 2026-10-30** to the current order event model (`docs/architecture/order-lifecycle.md`, ADR-0001). The 2026-09 version subscribed to `OrderCustomized`, `PickupWindowScheduled` and `OrderReadyForPickup`; the built Order raises different events. The earlier text is in git history (`git log -- docs/product/backlog/WI-QUE-001.md`).

**Context / Why**
ADR-0004's explicit CQRS decision: vendor-side order views never query `orders` directly. This item builds the `order-status-readmodel` container, populated by consuming the events `ordering-service` publishes through its outbox (`ORD-005`). It is the backend half of the live queue display, without the UI (`QUE-002`).

**Inputs / References**
- *Decisions*: ADR-0004 (CQRS split, `order-status-readmodel` shape, `vendorId` partition key), ADR-0003 (at-least-once delivery and per-aggregate sequencing; the read-model must tolerate both), ADR-0001 (event layers).
- *Interfaces*: `IEventSubscriber` (`EVT-003`), `IRepository<T>` (`DATA-002`), the events published by `ORD-005`.
- *Environment/tooling*: local event backbone (Redis Streams) and the Cosmos emulator (`docs/operations/local-dev.md`).
- *Test/chaos methodology*: tests proving an idempotent, out-of-order-tolerant projection.
- *Business context*: `data-model-api-contracts.md` (`OrderStatusView`), `order-lifecycle.md` (who raises which event).

**You do not need to know about**
- The `web-queue-display` UI (`QUE-002`) or any container beyond `order-status-readmodel`.

**Out of scope**
- The queue display UI.
- Reading the `orders` container directly under any circumstance: that is the one hard rule this item exists to enforce.
- Reacting to `PickupWindowScheduled` and `OrderReadyForPickup`: they belong to `PickupFulfillment` (`ORD-003`, not yet built). When it publishes them, the projection can take them as a later addition.

**Requirements / Acceptance Criteria**
- `OrderStatusView` per `data-model-api-contracts.md`: `orderId, vendorId, status, line items (denormalized for display), pickup window, lastUpdatedAt`. `customerName` is an open point (below).
- Subscribes to the events the Order raises: `OrderPlaced`, `OrderConfirmed` (it carries the fulfillment details, including any requested pickup window), `OrderPreparationStarted`, `OrderReadyForFulfillment`, `OrderCompleted` and `OrderCancelled`. Each is projected into the view, keyed by `orderId` and partitioned by `vendorId`; the status follows the event.
- Dedupes on event id (a repeated event changes nothing), using the dedupe store chosen in `data-model-api-contracts.md` with a 48-hour TTL.
- Handles out-of-order delivery with `sequenceNumber` (one per transition, no gaps): an older event arriving after a newer one is detected and discarded. An out-of-order event does not corrupt the view.
- `GET /ordering/orders?vendorId=` serves from the read-model, never from `orders`, and enforces that the token's subject owns the vendor (ADR-0006).

**Dependencies**
- Blocked by (done): `ORD-005`, `EVT-003`, `DATA-002`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: a test that an out-of-order event does not corrupt the read-model, and one that a repeated event changes nothing.

**AI-agent suitability**
Yes. Specified by ADR-0003 and ADR-0004 and the data contract; the open points are small.

**Interfaces consumed**: `IEventSubscriber` (`EVT-003`), `IRepository<T>` (`DATA-002`), `ICacheProvider` (`CACHE-002`, for dedupe)
**Events published/consumed**: consumes the six Order events above; publishes none
**Data touched**: `order-status-readmodel` container

**Open Points (working)**
- [x] `customerName`: orders carry the customer id **Resolved:** the vendor card shows the short order reference and no customer name. -- from the token, not a name, and no service holds one yet. Show the short order reference instead, or defer the field until a profile exists.
