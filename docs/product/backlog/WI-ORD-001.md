> **Status:** Done · evidence: `services/ordering-service` and its tests; the verification below was run on 2026-10-28

> **Update 2026-11-08 (documentation pass):** the optional `X-Test-Payment: decline` header named in the body was replaced by saved payment methods (`WI-ORD-010`): checkout names a payment method and the payment stub judges its token. There is no test header or hook now.

```
WI ID:               ORD-001
Title:                Checkout (payment stubbed)
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text is in git history (`git log -- docs/product/backlog/WI-ORD-001.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
The customer-facing entry point into the order lifecycle. `data-model-api-contracts.md` specifies `POST /ordering/checkout` as triggering a Stripe destination charge (ADR-0005), but `EPIC-PAYMENTS` is not built, so this item stubs the payment step by name rather than building Stripe early or skipping it silently.

**What exists**
- `POST /ordering/checkout` (Customer role; `customerId` from the token; `Idempotency-Key` header; optional `X-Test-Payment: decline` outside Production). It takes line items (`listingId`, `modifierIds`, `quantity`) and an optional pickup window. It validates, reads and prices every item from the catalog in integer cents (D-1), checks the pickup window, reserves stock (`CAT-006`, using the service token of `AUTH-006`), authorizes payment through a **stub** (`IPaymentProcessor`, which logs a warning on every call), and stores the order as `Placed` (`ORD-006`). The client never supplies a price, total, customer or status.
- A reservation is released if payment is declined or the save fails.
- `GET /ordering/orders/{id}` (owner only; `404` for anyone else) reads the order back.
- **Idempotency (D-6):** the order id is derived from `(customerId, key)`, so the create-only write decides a race, the catalog reservation (keyed by the same id) is repeatable, and a retry returns the original order (`200`). A hash of the request is stored with the order; the same key with a different request is `422 idempotency_key_reuse`. This replaces the contract's candidate "Cosmos unique-key constraint".
- **Pickup windows (D-3, D-8):** `PickupSchedule` offers 15-minute slots from 08:00 to 17:00 Eastern, converted to UTC for each date with the zone's rules (13:00Z in winter, 12:00Z in summer), at least 30 minutes ahead, for today and two more days; all of it is configuration (`Pickup:*`). The window is optional. `GET /ordering/pickup-windows` (`WI-ORD-003`) offers the same schedule.
- **Error codes:** `listing_unavailable`, `invalid_modifier`, `invalid_quantity`, `pickup_window_unavailable`, `payment_declined` (402), `idempotency_key_reuse`; added: `insufficient_stock` (409, with the quantity available per line), `validation_failed` (422), `downstream_unavailable` (503).
- Checkout also publishes order events through the outbox (`WI-ORD-005`) and applies automatic confirmation (`WI-ORD-008`); those items own that behavior.

**Out of scope**
- A real Stripe charge, `application_fee_amount` commission split and webhook handling: `PAY-001`, a later item. Checkout calls a payment abstraction that currently always succeeds, so `PAY-001` can implement it without reworking the flow.
- Reviews and payout reconciliation.

**Acceptance criteria (as met)**
- Checkout creates an `Order` (`ORD-002`) in `Placed` status, persists it (`ORD-006`) and calls the payment step through an interface; the stub is named and logged so it cannot be mistaken for a working integration.
- Integration tests prove checkout through to a stored `Placed` order.

**Verification (local, 2026-10-28)**
- 221 ordering tests at the time (also on Linux in a container): pricing against the contract's expected totals (1800, 525, 1875), every error path, idempotency and races, cleanup after failures, and 26 HTTP tests through the real host, catalog gateway and service-token handler against a real HTTP stand-in. Mutation checks covered releasing stock, the lost-race path, the key comparison, pricing, the customer-only policy, the Production-only hook and anonymous listing reads.
- On the real stack (mock issuer, catalog on Cosmos and Redis, ordering on Cosmos, a customer logged in through PKCE): a priced order was placed and read back; a repeat returned the same order with the stock taken once; 12 simultaneous identical submits made one order; a declined payment released the stock; 7 competing carts for the last 4 croissants gave 4 orders and 3 refusals; a wrong window, unknown option, draft listing and over-limit quantity were refused; no tokens, secrets or idempotency keys appeared in the log.
- The ordering test project currently has 340 tests (337 passed, 3 skipped on 2026-10-30; `docs/evidence/facts-sheet-2026-10-29.md`).

**Not done**
- A real payment (`PAY-001`, open item 69); cleanup of orphaned reservations (open item 62); a container image for the service (open item 71); a run on Azure.
- Done since this was first written, by other items: the order events (`ORD-005`), vendor actions (`ORD-007`), and the BFF `placeOrder` mutation and web checkout (slice 1).

**Changes from the original plan**
- There is no `POST /ordering/cart` (D-2): the cart lives in browser state and checkout takes line items directly. The cart endpoint and its storage are deferred. The title changed from "Cart + checkout" to "Checkout".
- Prices are computed on the server in integer cents; the plan did not say how.
- Idempotency is by a derived order id and a stored request hash, not a unique-key constraint.
- The payment stub is `IPaymentProcessor`, as the plan's open point proposed; that point is closed.
- Pickup windows, the request-hash conflict, the stock reservation and release, and four error codes were added.

**Dependencies**
- Blocked by (all done): `CAT-001`, `ORD-002`, `ORD-006`; stock reservation uses `CAT-006`; the service token uses `AUTH-006`.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the payment stub is named and logged.

**Interfaces consumed**: the catalog's listing reads and stock endpoints (`CAT-001`, `CAT-006`), `ORD-002`, `ORD-006`
**Events published/consumed**: triggers the `Placed` transition and its event (`ORD-002`, `ORD-005`)
**Data touched**: `orders` container (via `ORD-006`)

**Open Points (working)**
- [x] Shape of the payment stub. **Resolved 2026-10-28:** `IPaymentProcessor` with one stub implementation that logs a warning on every call.
