> **Status:** In review · built and run locally on `feature/order-history` (2026-11-04); the page, the BFF query and the ordering endpoint pass their tests and the real-stack journeys (29 passed), nothing is deployed; waiting for the lead's review

> **Outcome note (2026-11-04):** built in three commits. (1) ordering-service: `GET /ordering/orders?limit=&after=`, customer role only, the customer always the token's subject (a `customerId` in the query is ignored), newest first by creation time, cursor `{createdAtMs}:{id}`, page size 20 (1 to 100), an invalid cursor is 422 `validation_failed`; `OrderStore.ListForCustomerAsync` reads the customer's partition only. (2) BFF: `orders(first, after): OrderConnection!` (page size at most 50); the caller's token is forwarded unchanged, a 401 is UNAUTHENTICATED and a 403 FORBIDDEN, and `endCursor` is ordering's cursor. (3) `apps/web-customer`: `/orders` behind the login (client-rendered, nothing in the server HTML, `no-store`), a header link "Order history", ten per page with "Show older orders", empty and failed states, each row linking to `/orders/{id}`; the status wording moved to `src/lib/orderText.ts` and is shared with the order page.
>
> **Verified (local):** 11 new ordering API tests (another customer's orders absent, a `customerId` in the query ignored, paging without repeats or gaps, orders at the same instant, bad cursors, page bounds, roles; sorting taken backwards failed 2 of them and the partition filter taken out failed 3); 8 BFF tests (164 in all); 7 browser tests against the mock BFF (75 in all pass) and 2 real-stack journeys (the order placed in the browser is the first row; a vendor token is FORBIDDEN, no token UNAUTHENTICATED), 29 passed in `skeleton-smoke.mjs --containers`.
>
> **Not done / limits:** another customer's orders were not tried on the real stack (the mock issuer has one customer; the ordering API tests cover it with the in-memory repository); the real-stack paging branch runs only when the run has put more than ten orders in the history; the list reads the customer's whole partition for each page (register 139); no search, filter, vendor names or line names in the list (out of scope, the order page has them); nothing deployed.

```
WI ID:               CUST-007
Title:                Customer order history list
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               In review
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
- [x] Paging: a continuation cursor, as for the vendor list (`{milliseconds}:{id}`, so a new order cannot shift a page); the page size is 20 by default and at most 100 in ordering, at most 50 in the BFF, and 10 in the page (decided 2026-11-04 in the build, for the lead to confirm).

## Changes from the original plan

- The contract line `GET /ordering/orders?customerId=` became `GET /ordering/orders` with the customer taken from the token: a parameter naming the customer would be one more way to ask for someone else's orders.
- The list is newest by creation time (the vendor list orders by last change); an order does not move in the customer's list when its status changes.
