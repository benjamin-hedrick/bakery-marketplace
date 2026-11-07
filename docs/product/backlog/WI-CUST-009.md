> **Status:** In review · built and run locally 2026-11-07 on `feature/listing-cache` (web and Android); the Maestro flows were not re-run with it (the Android add is now asynchronous); waiting for the lead's review

> **Outcome note (2026-11-07):** built as specified. **customer-core** (`packages/customer-core/src/stockCheck.ts`): `decideAdd(read)` turns a fresh read (`listing` with its stock, `missing`, or `failed`) into "allowed, with this per-order limit" or a refusal (`sold_out`, `unavailable` for a status it does not know, `missing`, `check_failed`), and `ADD_REFUSAL_TEXT` has the plain words, each saying the item was not added. **Web** (`AddToOrder.tsx`): pressing the button runs a small `AddToOrderStockQuery` (`listing { id stock { status maxPerOrder } }`) with `fetchPolicy: 'network-only'`, which also refreshes the stored listing so the page's own badge and form follow it; the item is added only if allowed, with the fresh `maxPerOrder` (so the quantity is capped by it and the existing "limited to N per order" notice appears); a refusal is shown on the page that is left (a sold-out item no longer offers the form), the button is off while the read is in flight, and the "start a new order with this item" path reads again too. **Android** (`DetailScreen.tsx`, `src/stock.ts`): the same decision; `readFreshStock` turns the answer into the three cases, any failure being `failed`. **Mock BFF:** `POST /__control` takes `stock` (an override per service listing id), `failListingReads` and `resetStock`, and `GET /__reads` reports `listingReads` (test tooling for the mock; no product code changed for a test).
>
> **Verified (local):** 9 customer-core tests (95 in the package) and 5 Android unit tests (30 in the app) pass; 4 browser tests against the mock BFF (a still-in-stock item is added and the press made exactly one network read of the listing; an item that sold out after the page loaded is refused, nothing is added and the badge follows; a failed read adds nothing and a retry works; a quantity above the fresh limit is added at the limit and says so), and the whole mock-backed suite passes (141 after one existing test was changed to wait for the now asynchronous add). Mutation check: reading with `store-or-network` fails all 4 browser tests. **Real stack:** the new journey `tests/skeleton/add-stock-check.spec.ts` (the bakery sells the last croissant after the customer's page loaded; the add is refused; the stock is put back) passed in `skeleton-smoke.mjs` on the host, 57 of 57.
>
> **Changes from the original plan:** none to the requirements. **Not done:** the Maestro flows (none new, as specified; the existing ones that add an item were not re-run, and the Android add now waits for a network read first); the container run of the new journey; the Android screen itself has no component test (the decision and the read are unit tested; the screen is thin).

```
WI ID:               CUST-009
Title:                A fresh stock check when a customer adds an item to the order
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Engineering/Build
Status:               In review
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
- A fresh read that fails (network, service down): the customer is told the stock could not be checked and the item is **not** added silently; trying again works. (Decided by the lead 2026-11-07, over adding anyway.)
- An unknown status counts as unavailable (as `canOrder` does now).
- The cart page's checkout path is unchanged and remains the authoritative check.
- **Tests:** unit tests in customer-core for the decision (in stock, low, sold out, unknown, capped quantity, failure); browser tests against the mock BFF (a listing that was in stock and is sold out on the second read; a failed read; the happy path adds once); Maestro: none new (the Android flows stay as they are; a unit test covers the app's logic); real stack: one skeleton journey (the vendor sets a listing's quantity to 0 after the customer's page loaded, the customer's add is refused).

**Dependencies**
- Related: `WI-CAT-003` (invalidated on status change, so the fresh read is current), `WI-PORT-004`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.
