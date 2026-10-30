> **Status:** Done · evidence: `apps/web-customer` (`/orders/{id}`); `docs/evidence/slice-1/findings.md`. The order history list was split out into `WI-CUST-007`

```
WI ID:               CUST-004
Title:                Order confirmation + order status view
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 S
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text is in git history (`git log -- docs/product/backlog/WI-CUST-004.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
Completes the customer-facing view of one order: confirmation right after checkout and the order's current status, against `GET /ordering/orders/{id}`.

**What exists** (built on `feature/slice-1-checkout-ui` as `S1-04`, 2026-10-28)
- `/orders/{id}` is client-rendered behind the login and always read from the network (the status moves on without the page knowing; **Refresh status** asks again). Responses are `private, no-store` (ADR-0014).
- It shows the status in words (Order received, confirmed, being prepared, ready for pickup, picked up, cancelled), a short reference, what was ordered, the server's total, the pickup time or "No specific pickup time", and that no payment was taken.
- An order that does not exist or is not the customer's reads as not found.
- Item and option names are read from the live listings, because an order line carries ids and the price charged (open item 78).
- Logging out reloads the home page so nothing fetched while logged in stays in the page's memory.
- Data comes through the GraphQL BFF via Relay (ADR-0012, ADR-0013); the status shown is the persisted, authoritative state from `ordering-service` (`WI-PORT-007`).

**You do not need to know about**
- How ownership is enforced server-side (`AUTH-002`); this item renders the result as "not found".

**Out of scope**
- Any authorization check (backend only).
- The live order-queue display (`EPIC-QUEUE-DISPLAY`).
- The order history list: now `WI-CUST-007` (register item 80).

**Acceptance criteria (as met)**
- An order confirmation view immediately after a successful checkout (`CUST-003`).
- A single-order status view.
- A request for another customer's order renders a clean "not found" state, not a raw error.

**Verification**
- Local, at the time: 8 browser tests including the confirmed and waiting states, the login gate, refresh, a load failure and logout; six mutation checks, each failing a test.
- Re-run 2026-10-30: the mock-backed browser suite (which includes these tests) passed in each of 10 runs; the real-stack journeys passed in each of 3 runs (`docs/evidence/baseline-2026-10-30.md`).

**Changes from the original plan**
- The history list (`GET /ordering/orders?customerId=`) is not built here; it is `WI-CUST-007`. The title dropped "history".
- A "403" is rendered as "not found": the service answers `404` for an order that is not the caller's, so existence is not revealed.
- Implementation: a client-rendered Next.js page with data through the BFF and Relay; dependencies changed from `WEB-001` (superseded) to `PORT-002` and `PORT-007`.

**Dependencies**
- Blocked by (done): `PORT-002`, `PORT-007`, `CUST-003`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Open Points (working)**
*(none currently)*
