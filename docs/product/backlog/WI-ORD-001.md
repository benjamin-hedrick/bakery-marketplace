> **Outcome note (2026-10-28):** built on `feature/ordering-checkout`. `POST /ordering/checkout` (Customer role; `customerId` from the token; `Idempotency-Key` header; optional `X-Test-Payment: decline` outside Production) validates, reads and prices every item from the catalog in integer cents, checks the pickup window, reserves stock (`CAT-006`, with the service token of `AUTH-006`), authorizes payment through a clearly named **stub** (`IPaymentProcessor`, logs a warning on every call), and stores the order as `Placed` (`ORD-006`). A reservation is released if payment is declined or the save fails. `GET /ordering/orders/{id}` (owner only, `404` for anyone else) reads it back. No cart endpoint, per D-2.
>
> **Idempotency (D-6):** the order id is derived from `(customerId, key)`, so the create-only write decides a race, the catalog reservation (keyed by the same id) is repeatable, and a retry returns the original order (`200`). A hash of the request is stored with the order; the same key with a different request is `422 idempotency_key_reuse`. This replaces the contract's candidate "Cosmos unique-key constraint".
>
> **Pickup windows (D-3, D-8):** `PickupSchedule` offers 15-minute slots from 08:00 to 17:00 **Eastern**, converted to UTC for each date with the zone's rules (so daylight saving moves them: 13:00Z in winter, 12:00Z in summer), at least 30 minutes ahead, for today and two more days; all of it is configuration (`Pickup:*`). The window is optional. `GET /ordering/pickup-windows` (see `WI-ORD-003`) was added afterwards on the same schedule; the `PickupFulfillment` events remain `ORD-003`.
>
> **Error codes** follow the contract (`listing_unavailable`, `invalid_modifier`, `invalid_quantity`, `pickup_window_unavailable`, `payment_declined` 402, `idempotency_key_reuse`). Added: `insufficient_stock` (409, with the quantity available per line), `validation_failed` (422) and `downstream_unavailable` (503).
>
> **Verified (local):** 221 ordering tests (also on Linux in a container): pricing against the contract's expected totals (1800, 525, 1875), every error path, idempotency and races, cleanup after failures, and 26 HTTP tests through the real host, catalog gateway and service-token handler against a real HTTP stand-in; mutation checks for releasing stock, the lost-race path, the key comparison, pricing, the customer-only policy, the Production-only hook and anonymous listing reads. And on the **real stack** (mock issuer, catalog on Cosmos and Redis, ordering on Cosmos, a customer logged in through PKCE): a priced order placed and read back; a repeat returned the same order with the stock taken once; 12 simultaneous identical submits made one order; a declined payment released the stock; 7 competing carts for the last 4 croissants gave 4 orders and 3 refusals; wrong window, unknown option, draft listing and over-limit quantities refused; no tokens, secrets or idempotency keys in the log.
>
> **Not done:** publishing `OrderPlaced` (`ORD-005`, open item 68), a real payment (`PAY-001`, open item 69), the BFF `placeOrder` mutation and the web checkout (open item 70), vendor actions (`ORD-007`), cleanup of orphaned reservations (item 62), a container image for the service (open item 71), a run on Azure.

```
WI ID:               ORD-001
Title:                Cart + checkout (payment stubbed)
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Built 2026-10-28 (see outcome note); events, real payment and the web layer remain
Size:                 M
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** (D-2) The first slice has **no `POST /ordering/cart`**: the cart lives in browser state and `POST /ordering/checkout` takes line items directly (`listingId`, `modifierIds`, `quantity`), a pickup window, and an idempotency key. The server computes all prices in integer cents (D-1) and takes `customerId` from the token. The cart endpoint and its storage stay deferred. The payment stub requirement is unchanged. See `docs/architecture/first-slice-contract.md` (decisions D-n) and `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
The customer-facing entry point into the order lifecycle. `data-model-api-contracts.md` specifies `POST /ordering/checkout` as triggering a Stripe destination charge (ADR-0005) — but `EPIC-PAYMENTS` isn't built yet, so this item explicitly stubs the payment step rather than either building Stripe integration early (out of sequence) or silently skipping it without saying so.

**Inputs / References**
- *Decisions*: `data-model-api-contracts.md` (cart/checkout endpoints), ADR-0005 (real charge behavior this item deliberately does not implement yet)
- *Interfaces*: `Order` aggregate (`ORD-002`), `ORD-006` (persistence), `CAT-001` (listings to add to cart)
- *Environment/tooling*: not applicable beyond what's already wired
- *Test/chaos methodology*: standard unit/integration tests
- *Business context*: `docs/architecture/ddd/glossary.md` (Cart, Line Item)

**You do not need to know about**
- Real Stripe integration details (ADR-0005) — this item's payment step is a stub, not a real implementation

**Out of scope**
- Does not implement a real Stripe charge, `application_fee_amount` commission split, or webhook handling — that's `PAY-001`, a later, separate item. This item's checkout step calls a payment-step abstraction that currently always succeeds (a no-op/stub), so `PAY-001` can later implement it for real without reworking checkout's own flow
- Does not implement reviews or payout reconciliation

**Requirements / Acceptance Criteria**
- `POST /ordering/cart` builds/updates a cart (line items: `listingId`, `modifiers[]`, `quantity`) — validated against `CAT-001`'s real listing data (price, existence), not invented client-side values
- `POST /ordering/checkout` creates an `Order` (`ORD-002`) in `Placed` status, persists it (`ORD-006`), and calls a payment step abstracted behind an interface stub that always returns success — explicitly named/logged as a stub, not silently indistinguishable from a real charge
- Integration test proving a full cart → checkout → `Order` persisted in `Placed` status flow

**Dependencies**
- Blocked by: `CAT-001`, `ORD-002`, `ORD-006`
- Can be worked in parallel with: `ORD-005`, `CAT-003`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the payment-step stub must be clearly named/logged so a future reviewer can't mistake it for a working integration.

**AI-agent suitability**
Yes — the stubbed payment boundary removes the one piece that would otherwise need `EPIC-PAYMENTS` decided first.

**Interfaces consumed**: `CAT-001`'s listing reads, `ORD-002`/`ORD-006`
**Events published/consumed**: triggers `ORD-002`'s `OrderPlaced` transition
**Data touched**: `orders` container (via `ORD-006`)

**Open Points (working)**
- [ ] Confirm the payment-step stub's exact shape (e.g., an `IPaymentProcessor` interface with a single always-succeeds implementation) — proposed above as the default so `PAY-001` has a clean seam to implement against later, but not yet confirmed as a real decision anywhere.
