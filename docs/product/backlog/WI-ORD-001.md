```
WI ID:               ORD-001
Title:                Cart + checkout (payment stubbed)
Type:                 Service Implementation
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
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
