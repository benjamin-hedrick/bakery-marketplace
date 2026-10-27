```
WI ID:               QUE-002
Title:                web-queue-display app — live UI
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  EPIC-WEB-CUSTOMER (shares WI-WEB-001's scaffold/auth pattern)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements (polling-based live queue UI, 5–10s, push deferred to v2) are retained. **Implementation changes**: Next.js per ADR-0012 (client-rendered, no SSR need), with data through the GraphQL BFF (ADR-0013); polling uses Relay refetch. **Dependencies change**: builds on `WI-PORT-002`'s scaffold instead of `WI-WEB-001`. Still reads `order-status-readmodel` only (ADR-0004). See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
`QUE-001` builds the event-fed `order-status-readmodel` read side; this item is the actual counter/kitchen display against it. Uses the same scaffold and auth pattern as `web-customer` (`WEB-001`) rather than a second bespoke implementation.

**Inputs / References**
- *Decisions*: ADR-0011 (frontend framework), ADR-0004 (CQRS — this view never queries `orders` directly)
- *Interfaces*: `WI-WEB-001`'s scaffold/auth wrapper, `QUE-001`'s read-model endpoint (`GET /ordering/orders?vendorId=`)
- *Environment/tooling*: not applicable beyond `WEB-001`
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (Order Status values)

**You do not need to know about**
- The event-sourcing mechanics that populate `order-status-readmodel` — this item only reads it

**Out of scope**
- Does not build a real-time push mechanism (WebSockets/SignalR) — named as a future enhancement, not silently deferred (see below)
- Does not implement any order-modification action from this screen — display only, per `data-model-api-contracts.md`'s read-model design

**Requirements / Acceptance Criteria**
- Polls `GET /ordering/orders?vendorId=` on a fixed interval (5–10s) for v1
- Displays each order's status, denormalized line items, and pickup window per `OrderStatusView`'s shape
- Visually distinguishes status transitions (e.g., newly-arrived vs. already-seen orders) so kitchen staff notice new work without a push mechanism
- **Real-time push (WebSockets/SignalR) explicitly named here as a v2 candidate**, not built now — polling is an accepted v1 limitation given the read-model's already-bounded event-delivery lag (ADR-0003/0004), not an additional regression

**Dependencies**
- Blocks: none
- Blocked by: `WI-WEB-001`, `QUE-001`
- Can be worked in parallel with: `CUST-002`, `CUST-003`, `CUST-004`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing read-model contract; polling-vs-push was a scoping call already made explicitly above, not left open.

**Open Points (working)**
*(none currently)*
