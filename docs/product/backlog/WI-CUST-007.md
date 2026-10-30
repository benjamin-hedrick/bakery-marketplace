> **Status:** Ready

```
WI ID:               CUST-007
Title:                Customer order history list
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

> Split out of `WI-CUST-004` on 2026-10-30. Register item 80 describes the gap.

**Context / Why**
The order page is reached by the id `placeOrder` returned. There is no list of a customer's orders and no way back to an order except that link. A customer who closes the tab loses the way to the order.

**Inputs / References**
- *Decisions*: ADR-0004 (orders are partitioned by customer, so a per-customer list is a single-partition query), ADR-0006 (ownership), ADR-0013 and ADR-0014 (BFF, Relay; authenticated responses are `private, no-store`).
- *Interfaces*: `WI-CUST-004`'s order page, `WI-ORD-006`'s order store.
- *Business context*: `docs/architecture/data-model-api-contracts.md` lists `GET /ordering/orders?customerId=`.

**You do not need to know about**
- How the status moves (`ORD-007`, `ORD-008`); the list shows the persisted status.

**Out of scope**
- Vendor-side order lists, search and filtering of history, and cancellation from the list.

**Requirements / Acceptance Criteria**
- ordering-service offers a list of the calling customer's orders, newest first, paged, never including another customer's orders (parameterized Cosmos query within the customer's partition).
- The BFF exposes an `orders` query that maps it without adding rules; the schema file is the contract.
- A page lists the orders with status in words, date, total and a link to `/orders/{id}`; an empty history says so; the page is behind the login and never cached.
- Tests: ordering API tests including another customer's orders absent; BFF mapping tests; a browser test for the list and the empty state.

**Dependencies**
- Blocked by (done): `CUST-004`, `ORD-006`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for the query, BFF mapping and page. The paging shape and the page size are small design choices to confirm.

**Open Points (working)**
- [ ] Paging: a continuation token or an offset, and the page size.
