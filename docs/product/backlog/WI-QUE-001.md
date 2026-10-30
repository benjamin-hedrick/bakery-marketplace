> **Status:** Ready

```
WI ID:               QUE-001
Title:                Order-status read-model (event-fed, not direct query)
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
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
- [ ] `customerName`: orders carry the customer id from the token, not a name, and no service holds one yet. Show the short order reference instead, or defer the field until a profile exists.
