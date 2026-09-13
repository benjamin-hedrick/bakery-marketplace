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

**Context / Why**
ADR-0004's explicit CQRS decision: vendor-side order views never query `orders` directly. This item builds the `order-status-readmodel` container, populated by consuming `ordering-service`'s own published events — the backend half of the live queue display, without the UI (`QUE-002`, a separate, currently undetailed item — see `docs/product/backlog/PARKING-LOT.md`'s frontend-scope entry).

**Inputs / References**
- *Decisions*: ADR-0004 (CQRS split, `order-status-readmodel` shape, `vendorId` partition key), ADR-0003 (at-least-once, per-aggregate sequencing — this read-model must tolerate both)
- *Interfaces*: `IEventSubscriber` (`EVT-003`), `IRepository<T>` (`DATA-002`), `ORD-005`'s published events
- *Environment/tooling*: local event backbone + Cosmos emulator (`DEV-001`)
- *Test/chaos methodology*: standard tests proving idempotent, out-of-order-tolerant projection — reuses the dedupe pattern named in ADR-0003/`data-model-api-contracts.md` (dedupe via `CacheProvider`, keyed by event ID)
- *Business context*: `data-model-api-contracts.md` (`OrderStatusView` shape)

**You do not need to know about**
- The actual `web-queue-display` UI (`QUE-002`) — this item is the backend projection only
- Any container beyond `order-status-readmodel`

**Out of scope**
- Does not build `web-queue-display`'s UI (`QUE-002`)
- Does not query the `orders` container directly under any circumstance — that's the one hard rule this item exists to enforce

**Requirements / Acceptance Criteria**
- `OrderStatusView` per `data-model-api-contracts.md`: `orderId, vendorId, customerName, status, lineItems (denormalized), pickupWindow, lastUpdatedAt`
- Subscribes to `OrderPlaced`, `OrderCustomized`, `PickupWindowScheduled`, `OrderReadyForPickup`, `OrderCompleted` and projects each into the read-model, keyed by `orderId`/partitioned by `vendorId`
- Dedupes on event ID via `CacheProvider` (per the dedupe-store decision already made in `data-model-api-contracts.md`'s design note) with a 48-hour TTL — the same value already proposed there
- Handles out-of-order delivery gracefully using `sequenceNumber` — an out-of-order event doesn't corrupt the projection (e.g., an older event arriving after a newer one is detected and discarded, not blindly applied)
- `GET /ordering/orders?vendorId=` (per `data-model-api-contracts.md`) serves from this read-model, never from `orders`

**Dependencies**
- Blocked by: `ORD-005`, `EVT-003`, `DATA-002`
- Can be worked in parallel with: `ORD-001`, `CAT-003`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: a test specifically proving an out-of-order event doesn't corrupt the read-model, not just that in-order events work.

**AI-agent suitability**
Yes — fully specified by ADR-0003/0004 plus the existing data contract's design note on dedupe-store location.

**Interfaces consumed**: `IEventSubscriber` (`EVT-003`), `IRepository<T>` (`DATA-002`), `ICacheProvider` (`CACHE-002`, for dedupe)
**Events published/consumed**: consumes all five Order lifecycle events; publishes none
**Data touched**: `order-status-readmodel` container

**Open Points (working)**
*(none currently)*
