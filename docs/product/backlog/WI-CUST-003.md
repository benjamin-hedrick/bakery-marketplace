> **Status:** Done · evidence: `apps/web-customer`; `docs/evidence/slice-1/findings.md`

```
WI ID:               CUST-003
Title:                Cart + checkout UI
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Done
Size:                 M
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text is in git history (`git log -- docs/product/backlog/WI-CUST-003.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
`ORD-001` provides checkout against a stubbed payment. This item is the UI on top of it. Because the payment is a stub, the UI must say so visibly, not leave it as a backend-only disclaimer.

**What exists** (built on `feature/slice-1-checkout-ui` as `S1-03`, 2026-10-28)
- On the listing page: options (checkboxes with price and allergens, in the server HTML), a quantity limited to the per-order maximum, and **Add to order**.
- The order is a browser cart kept in `sessionStorage`, so it survives a reload and the login redirect; it holds ids, options and quantities only.
- `/checkout` is client-rendered behind the login gate. The customer reviews and changes the order, chooses a pickup time from `pickupWindows` (always fetched fresh; optional; shown in the customer's own time zone) or none, and presses **Place test order**, which calls the `placeOrder` mutation through the BFF. A banner says no payment is taken.
- The idempotency key belongs to one content of the order: the same order submitted again reuses it, any change replaces it, and the button is disabled while an order is in flight.
- Every error state of the first-slice contract section 6 is handled from the typed `PlaceOrderRejected` codes: stock shortfalls offer the quantity that is left, a taken pickup time reloads the open ones, an ended login returns to the gate with the order kept, and an unexpected failure shows the trace reference.
- Price and availability are revalidated by `ordering-service`, never trusted from the client (ADR-0013, ADR-0014). The mutation, idempotency, error mapping and Relay store updates are defined by `WI-PORT-007`.

**Out of scope**
- Refunds (`PAY-004`) and any payout-facing UI.
- Card entry: there is none, because there is no real payment yet.

**Acceptance criteria (as met)**
- Cart state is held in the browser until checkout.
- Checkout runs through `placeOrder`.
- A visible test-mode banner is on the payment step.
- Pickup-window selection is part of checkout.

**Verification**
- Local, at the time: 53 unit tests (cart, limits, fingerprint, store); 56 browser tests against the mock BFF, repeatedly green; seven mutation checks on the form and five on the order controls, each failing a test; the real-stack smoke (7 of 7).
- Real stack (`S1-07b`): in a browser against the real ordering service, catalog, BFF and the mock issuer's own login page, a plain order confirms by itself; an order with an option and a pickup time waits for the bakery; a declined payment keeps the order and the same order then goes through under a new key (a rejected checkout spends its key, per the first-slice contract); asking for more than is in stock names how many are left and taking that many works; a sold-out item cannot be ordered. Stock was checked at the catalog each time (18 of 18 in the smoke, locally). That run also found that a sold-out listing hid its options and allergens (fixed).
- Re-run 2026-10-30: 53 web unit tests passed; 57 mock-backed browser tests passed in each of 10 runs; 21 real-stack journeys passed in each of 3 runs (`docs/evidence/baseline-2026-10-30.md`).
- **Not verified:** a first run on Azure.

**Changes from the original plan**
- The checkout is a GraphQL mutation through the BFF, not a direct call to `POST /ordering/checkout`; the page is a client-rendered Next.js page behind login.
- There is no Stripe.js or Elements card entry, because the payment is a stub; the plan's card-entry criterion is replaced by the test-order button and banner.
- There is no `POST /ordering/cart`: the cart is client state (D-2).
- Dependencies changed from `WEB-001` (superseded) to `PORT-002` and `PORT-007`.
- Pickup-window selection uses `pickupWindows`, not a `PickupWindowScheduled` event.

**Dependencies**
- Blocked by (done): `PORT-002`, `PORT-007`, `CUST-002`. Blocks: `CUST-004`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Open Points (working)**
*(none currently)*
