> **Status:** Done · evidence: the Outcome note under this banner; `apps/web-queue-display`

> **Outcome note (2026-11-02):** built on `feature/vendor-order-detail`. `apps/web-queue-display` is a Next.js Pages Router app (port 3100), client-rendered, with a Relay environment and the same browser-side login as `web-customer`. It shows the vendor's orders that are still in progress in three columns (New, Preparing, Ready), the oldest first, each with its short reference, quantities, listing and option names (ids where a name is not known), the requested pickup window and any instructions. It asks the BFF's `vendorOrders` query every 7 seconds with the vendor's token; an order that appears after the first answer is marked **New** for a minute and announced to screen readers; a failed poll keeps the last good queue with a notice and recovers by itself; a login the service refuses, or one that is not a vendor's, says so. It changes nothing. Tests: 51 unit tests (login library copy, queue grouping and new-order logic) and 11 Playwright tests against a mock BFF and a stubbed issuer (columns, ordering, new-order mark and announcement, status moves, polling with the token, a failing poll, an ended login, a non-vendor login, display-only, axe accessibility, token not stored). **Not run:** against the real BFF, services and mock issuer (the issuer needs `MockOidc__RedirectUris__1=http://localhost:3100/auth/callback` and `MockOidc__AllowedOrigins__1=http://localhost:3100`, a change the lead has not made), nor on Azure.
>
> **Note (2026-11-02, WI-QUE-003):** polling is no longer the only way the screen is kept current. ADR-0021's pushed stream (`WI-QUE-003`) now sits in front of it: while the stream is up the screen says **Live**, applies changed orders by their sequence numbers, and asks for the list only as a check every 60 seconds; when the stream is down it says **Polling** and does what this item built (the list every 7 seconds, `POLL_MS`). The polling code, its behaviour and its 19 browser tests are unchanged and still pass; the mock BFF refuses the subscription unless a test turns it on, so those tests exercise the fallback. The "real-time push is a v2 candidate" lines below are history.

> **Changes from the original plan:** polling uses Relay's `fetchQuery` with `network-only` on a timer, not a refetch container (the page needs no other query); the screen is client-rendered with no server-side Relay at all; the endpoint is the BFF's `vendorOrders(status: ACTIVE)` (the `GET /ordering/orders?vendorId=` of the spec was not built, see `WI-QUE-001`); the login and Relay code are a copy of `web-customer`'s (register item 115) because the spec's "shared scaffold" had no shared package to use. Known limits: the token is held in memory, so a reload logs a wall screen out and nobody is there to log it in again (register items 24 and 116).

```
WI ID:               QUE-002
Title:                web-queue-display app — live UI
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  EPIC-WEB-CUSTOMER (shares WI-WEB-001's scaffold/auth pattern)
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements (polling-based live queue UI, 5–10s, push deferred to v2) are retained. **Implementation changes**: Next.js per ADR-0012 (client-rendered, no SSR need), with data through the GraphQL BFF (ADR-0013); polling uses Relay refetch. **Dependencies change**: builds on `WI-PORT-002`'s scaffold instead of `WI-WEB-001`. Still reads `order-status-readmodel` only (ADR-0004). See `reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


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
