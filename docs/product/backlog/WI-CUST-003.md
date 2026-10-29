```
WI ID:               CUST-003
Title:                Cart + checkout UI
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

> **Outcome note (2026-10-28):** built on `feature/slice-1-checkout-ui` as `S1-03`. Options (checkboxes with price and allergens, in the server HTML), a quantity limited to the per-order maximum and **Add to order** on the listing page; the order is a browser cart kept in `sessionStorage` (so it survives a reload and the login redirect; ids, options and quantities only). `/checkout` is client-rendered behind the login gate: review and change the order, choose a pickup time from `pickupWindows` (always fetched fresh; optional, shown in the customer's own time zone) or none, and **Place test order** through `placeOrder`, with a banner that no payment is taken. The idempotency key belongs to one content of the order: the same order submitted again reuses it, any change replaces it, and the button is disabled while an order is in flight. Every error state of the first-slice contract section 6 is handled from the typed `PlaceOrderRejected` codes (stock shortfalls offer the quantity that is left, a taken pickup time reloads the open ones, an ended login returns to the gate with the order kept) and an unexpected failure shows the trace reference. **Verified (local):** 53 unit tests (cart, limits, fingerprint, store); 56 browser tests against the mock BFF, repeatedly green, including all of the above; seven mutation checks on the form and five on the order controls, each failing a test; the real-stack smoke (7/7). **Real stack (`S1-07b`):** the journey runs in a browser against the real ordering service, catalog, BFF and the mock issuer's own login page: a plain order confirms by itself; an order with an option and a pickup time waits for the bakery; a declined payment keeps the order and the same order then goes through, under a new key (a rejected checkout spends its key, see the first-slice contract); asking for more than is in stock names how many are left and taking that many works; a sold-out item cannot be ordered. Stock was checked at the catalog each time (18 of 18 in the smoke, locally). That run also found that a sold-out listing hid its options and allergens (fixed). **Not verified:** a first run on Azure.

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements (cart/checkout UI against `ORD-001`'s stubbed payment, demo/test-mode banner) are retained. **Implementation changes**: a client-rendered Next.js page (authenticated); checkout is a GraphQL mutation through the BFF, with idempotency, error mapping and Relay store updates defined by `WI-PORT-007`. Price and availability are revalidated server-side by `ordering-service`, never trusted from the client (ADR-0013/0014). **Dependencies change**: blocked by `WI-PORT-002` and `WI-PORT-007` instead of `WI-WEB-001`. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
`ORD-001` provides cart/checkout backend logic against Stripe (ADR-0005). This item is the UI on top of it. `ORD-001`'s own spec requires its Stripe integration be unmistakably a demo/test-mode stub, not a real charge path — that requirement must be visibly enforced at the UI layer too, not just left as a backend-only disclaimer.

**Inputs / References**
- *Decisions*: ADR-0005 (Stripe test mode), `docs/architecture/data-model-api-contracts.md` (`POST /ordering/cart`, `POST /ordering/checkout`)
- *Interfaces*: `WI-WEB-001`'s scaffold/auth wrapper, `CUST-002` (adds a listing to cart from the detail view)
- *Environment/tooling*: not applicable beyond `WEB-001`
- *Test/chaos methodology*: not applicable
- *Business context*: none beyond ADR-0005's stated test-mode scope

**You do not need to know about**
- Stripe Connect account/onboarding internals (`VEN-003`) — this item only calls the checkout endpoint

**Out of scope**
- Does not implement refunds (`PAY-004`) or any payout-facing UI
- Does not re-implement PCI scope handling — Stripe.js/Elements per ADR-0005 owns that

**Requirements / Acceptance Criteria**
- Cart state (add/remove line items, quantities/modifiers) held client-side until checkout
- Checkout flow against `POST /ordering/checkout`, using Stripe.js/Elements per ADR-0005 (card data never touches this app's own code)
- **A visible, unmissable demo/test-mode banner on the payment step** — a banner, not fine print — mirroring `ORD-001`'s own requirement that its stub be unmistakable
- Pickup-window selection as part of checkout (`PickupWindowScheduled`)

**Dependencies**
- Blocks: `CUST-004` (order confirmation follows a successful checkout)
- Blocked by: `WI-WEB-001`, `CUST-002`
- Can be worked in parallel with: `QUE-002`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0005 plus the existing API contract.

**Open Points (working)**
*(none currently)*
