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
