> **Status:** Ready

```
WI ID:               CUST-009
Title:                A fresh stock check when a customer adds an item to the order
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Written 2026-11-07 (lead's decision, same day).** Stock must be checked when adding to the cart and again at checkout. Checkout is already authoritative (atomic reservation, ADR-0017). Adding to the order today uses only the stock status already on the page, which may come from Relay's store or an open tab. Scope expansion approved by the lead 2026-11-07.

**Context / Why**
A customer can add an item that sold out after the page loaded and learn it only at checkout. The check at add is advisory (the server cannot reserve for a cart) but it should use fresh data.

**Inputs / References**
- *Decisions*: ADR-0014 (layer 2: Relay; the services stay authoritative), ADR-0017, `WI-PORT-004`.
- *Interfaces*: the BFF `listing(id)` query with `stock { status maxPerOrder }` (public); `AddToOrder` (web), `DetailScreen` (Android), `canOrder` and the cart in `packages/customer-core`.

**Out of scope**
- Reserving stock for a cart (carts are never held); a quantity count to customers (status only); hiding sold-out items; a new endpoint (the existing listing query is enough); any change to checkout.

**Requirements / Acceptance Criteria**
- Pressing "Add to order" first reads the listing's `stock` fresh from the network (Relay `fetchQuery` with `network-only`, as `CheckoutForm` already does for windows; the Android app calls the listing query again). The item is added only when the fresh status is `IN_STOCK` or `LOW`; the quantity is capped to the fresh `maxPerOrder`.
- Sold out on the fresh read: nothing is added, the page shows "Sold out" in words, and the stored listing record updates.
- A fresh read that fails (network, service down): the customer is told the stock could not be checked and the item is **not** added silently; trying again works. (Chosen over adding anyway, since checkout would refuse a sold-out item later; the lead may reverse this.)
- An unknown status counts as unavailable (as `canOrder` does now).
- The cart page's checkout path is unchanged and remains the authoritative check.
- **Tests:** unit tests in customer-core for the decision (in stock, low, sold out, unknown, capped quantity, failure); browser tests against the mock BFF (a listing that was in stock and is sold out on the second read; a failed read; the happy path adds once); Maestro: none new (the Android flows stay as they are; a unit test covers the app's logic); real stack: one skeleton journey (the vendor sets a listing's quantity to 0 after the customer's page loaded, the customer's add is refused).

**Dependencies**
- Related: `WI-CAT-003` (invalidated on status change, so the fresh read is current), `WI-PORT-004`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.
