```
WI ID:               CUST-004
Title:                Order confirmation + order history/status view
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements are retained. **Implementation changes**: a client-rendered Next.js page (authenticated), with data through the GraphQL BFF via Relay (ADR-0012/0013). Order status shown is the persisted, authoritative state from `ordering-service` (`WI-PORT-007`). Responses are `private, no-store` (ADR-0014). **Dependencies change**: blocked by `WI-PORT-002` and `WI-PORT-007` instead of `WI-WEB-001`. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
Completes the customer-facing order lifecycle view: confirmation right after checkout, and a history/status view for orders already placed, against endpoints `ARCH-003` already contracted.

**Inputs / References**
- *Decisions*: `docs/architecture/data-model-api-contracts.md` (`GET /ordering/orders/{id}`, `GET /ordering/orders?customerId=`), ADR-0006 (resource-ownership enforcement)
- *Interfaces*: `WI-WEB-001`'s scaffold/auth wrapper, `CUST-003` (order just placed)
- *Environment/tooling*: not applicable beyond `WEB-001`
- *Test/chaos methodology*: not applicable
- *Business context*: none

**You do not need to know about**
- How ownership enforcement actually works server-side (`AUTH-002`) — this item just handles the resulting 403 gracefully

**Out of scope**
- Does not re-implement any authorization check — entirely backend-side (`AUTH-002`'s pattern)
- Does not build the live order-queue display — that's a separate app/epic (`EPIC-QUEUE-DISPLAY`)

**Requirements / Acceptance Criteria**
- Order confirmation view immediately after a successful checkout (`CUST-003`)
- Order history list (`GET /ordering/orders?customerId=`) and a single-order status view (`GET /ordering/orders/{id}`)
- A 403 from either endpoint (e.g., viewing another customer's order via a stale/guessed URL) renders a clean "not found/not yours" state, not a raw error

**Dependencies**
- Blocks: none
- Blocked by: `WI-WEB-001`, `CUST-003`
- Can be worked in parallel with: `QUE-002`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing API contract.

**Open Points (working)**
*(none currently)*
