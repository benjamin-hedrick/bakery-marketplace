> **Status:** Proposed · decision: the lead, on the open points below (where the screens live, the edit's precondition, the stock settings, the validation messages, the scope of v1)

```
WI ID:                CAT-007
Title:                The vendor's listing and stock screens: list, create, edit, publish and adjust stock from the vendor's web app
Type:                 Frontend (with BFF operations and, depending on the open points, a small catalog change)
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-QUEUE-DISPLAY (the screens are proposed in the vendor's existing web app)
Hat/Owner:            Engineering/Build, Digital PM (the form and its wording)
Status:               Proposed
Size:                 L (could be split in two M: the BFF operations and the catalog change, then the screens; open point 6)
Verification class:   V3 + J (state-changing actions by a role, across the browser, the web app, the BFF and catalog). The classes are proposed in `docs/process/verification-policy.md` (register item 130); this item follows them as the other vendor items did.
```
ADRs and NFRs affected: ADR-0006 and ADR-0008 (catalog decides who owns a listing, even behind the BFF), ADR-0013 (the BFF is composition and error mapping only: no listing rule in it), ADR-0017 (stock: the quantity changes only by atomic steps; checkout's reservation decides), ADR-0019 (the writes go through the session and the CSRF checks of `/api/graphql`), ADR-0022 (the closed allergen list and the tag registry), ADR-0002 and ADR-0014 (an edit invalidates the listing cache; the vendor's own reads are never cached); NFR 3.1, 3.3 and 3.4.

**Context / Why**
The largest product gap (`current-plan.md`, Next item 1). A vendor can see and work their orders in the vendor web app (`WI-QUE-002` to `QUE-005`), but every listing, price, allergen and stock figure comes from the seed: there is no screen to add a croissant, change a price, mark something sold out or put a draft live. The catalog's endpoints for all of it exist and are tested (`WI-CAT-001`, `CAT-005`, `TAG-002`); nothing calls them except the seed and the tests. This item gives the vendor the screens and the BFF operations behind them, and closes the loop the demo cannot show today: a vendor changes a listing and the customer sees it.

**Inputs / References**
- *Decisions*: ADR-0006 and ADR-0008, ADR-0013, ADR-0017, ADR-0019, ADR-0022.
- *Interfaces* (catalog, `services/catalog-service/src/Api/ListingEndpoints.cs`, all with the vendor role and the vendor id from the token):
  - `GET /catalog/listings/mine?status=&limit=&after=` and `GET /catalog/listings/mine/{id}`: the vendor's own listings, drafts included, with the exact quantity and the low-stock threshold (`ListingDto.ForOwner`); another vendor's listing is a 404, as a missing one.
  - `POST /catalog/listings` (201) and `PUT /catalog/listings/{id}` (200), body `ListingRequest` (`ListingDtos.cs`): 422 `validation_failed` with errors per field, 409 `vendor_not_verified` when an unverified vendor publishes, 409 `conflict` after the service's own retries.
  - `POST /catalog/listings/{id}/stock/adjust` with `{ delta }`: atomic; 409 `made_to_order`, 409 `insufficient_stock` (below zero).
  - `GET /catalog/tags?kind=`: the registry (ADR-0022), for the allergen and tag choices.
- *Validation already in catalog* (`ListingValidator.cs`): name up to 120 characters, description up to 1000, category up to 50, price 0 to 10,000,000 cents, at most 20 options, tags per the registry's limits; a stock delta is non-zero and bounded by `StockPolicy.MaxQuantity`.
- *The app*: `apps/web-queue-display` (login, session, CSRF, the Relay network function, the mock BFF and the fake issuer for its browser tests).
- *Environment/tooling*: `docs/operations/local-dev.md`; for the real-stack run, `node scripts/ci/skeleton-smoke.mjs`.
- *Test methodology*: `docs/process/test-strategy.md`, `docs/process/verification-policy.md`, `docs/process/playwright-guide.md`, `docs/testing.md` (a test brings its own named seed data).

**You do not need to know about**
- The order side: reservations, the outbox, the vendor queue's stream.
- The customer app's pages, beyond seeing that a change reaches them in the evidence run.

**Out of scope**
- Photos of a listing (nothing stores an image).
- Deleting or archiving a listing: catalog has no endpoint; a vendor takes a listing off sale by putting it back to Draft (but see open point 5 for a duplicate draft).
- Vendor onboarding and verification (`VEN-001`, `VEN-002`), staff accounts for a vendor, the admin and moderation screens.
- Pickup windows, sponsored placement, sales figures, bulk import or export.
- An Android or other mobile screen for vendors (the Android app is the customer's).

**Requirements / Acceptance Criteria**
1. **Where.** The screens are pages of the vendor's web app under `/listings` (list), `/listings/new` and `/listings/[id]` (edit), behind the app's existing login and the vendor role, with a link between the queue and the listings in the header. *(Open point 1.)*
2. **BFF reads.** `Query.myListings(status: MyListingFilter, first: Int = 20, after: String): MyListingConnection!` and `Query.myListing(id: ID!): MyListing` (null when missing or another vendor's). `MyListing` is a type of its own, not the public `Listing`, so the exact quantity and the threshold can never reach a customer's query by a shared fragment. The BFF forwards the caller's token unchanged, decodes and encodes global ids, and adds no field catalog does not return. Answers are `private, no-store` (ADR-0014).
3. **BFF writes.** `createListing`, `updateListing` and `adjustListingStock`, each a union payload: success carries the listing; an expected refusal is `ListingRejected` with a code (`INVALID` with errors per field, `NOT_FOUND`, `VENDOR_NOT_VERIFIED`, `CHANGED` for a conflict or a failed precondition, `MADE_TO_ORDER`, `INSUFFICIENT_STOCK`) and a fixed client-safe message. No token is `UNAUTHENTICATED`, a token without the vendor role `FORBIDDEN`, any other failure a generic error, as for the other operations. The BFF holds no rule: it does not validate a price, choose a status or compute a stock delta. *(Open point 4 for the field messages.)*
4. **The list.** Each of the vendor's listings with its name, price, Draft or Published, its stock (made to order, or the quantity with In stock, Low or Sold out) and when it last changed; filtered by Draft or Published; paged. An empty list says how to add the first listing.
5. **Stock from the list.** For a counted listing, add or remove a number of units (an atomic `adjust`), and **Sold out**, which removes the quantity shown. A removal past zero is refused by catalog and the row shows the current quantity again with a sentence saying it had changed; the screen never sends an absolute quantity it read earlier (ADR-0017: a sale between the read and the write must not be undone). *(Open point 3.)*
6. **The form** (create and edit): name, description, category, price in dollars and cents (sent as cents), the allergens from the closed list as checkboxes (ADR-0022), the other tags from the registry, the options (name, price difference, allergens, tags), made to order or counted (with the starting quantity on create, the most per order and the low-stock threshold), and Draft or Published. Catalog's limits are shown as hints and enforced only by catalog; its errors appear beside their fields and in a summary at the top, and the form keeps what the vendor typed.
7. **An edit replaces only what the vendor changed, safely.** The form round-trips every field it loaded (a missing `modifiers` would clear the options, a missing `tags` leaves them; `ListingRequest`), sends the `stock` block only when the vendor changed a stock setting, and never sends a quantity read earlier on an edit. An edit made from a copy that has since changed (another tab, a second person) is refused, not applied over the newer one, and the form says so and offers to reload. *(Open point 2: this needs a precondition catalog does not have today, register 208.)*
8. **Publishing.** Publish and unpublish are the form's status (and a button on the list that saves only the status, under the same precondition). An unverified vendor's publish shows "Your shop must be verified before a listing can go live", and the listing stays a draft.
9. **No double effect.** While a write is in flight its controls are disabled; a failure re-enables them and says what happened in words, not codes. A create that times out does not invite a second click that makes a second listing without warning. *(Open point 5.)*
10. **Accessible.** Real labels on every field, errors tied to their fields (`aria-describedby`) and announced, every control reachable by keyboard, the listing's name in each row control's accessible name ("Remove 1 from Almond Croissant"), and no automatically detectable accessibility violation on the list, the empty list, the form and the form with errors.
11. **Abuse and failure cases, each with a test:** another vendor's listing id (not found, in the BFF test and against the real catalog); a customer's token (forbidden); no token; a hostile or undecodable id (not found without a call to catalog); a large or malformed body (the existing limits hold); price and quantity at and past their limits; a negative or zero delta; a stock removal racing a customer's checkout (one wins, no negative stock, the screen shows the result); two tabs editing the same listing (the second save is refused, requirement 7); a write without the session's CSRF headers (refused by the web app, nothing reaches the BFF); catalog down or slow (a bounded wait and a message, not a hang).
12. **Security-property tests** (the role, the ownership, the owner-only fields never on the public type, the CSRF refusal) are shown to fail with the check removed, and the outcome note says how.
13. **The customer sees it.** An evidence run on the real stack from a stated starting state, recorded with the commit, command, date and raw output under `docs/evidence/WI-CAT-007/`: a seeded vendor creates a draft (not on the customer's menu), publishes it (on the menu), changes its price (the customer's detail page shows the new price), sells it out from the list (the customer sees Sold out) and puts it back to Draft (off the menu); plus another vendor's id refused. The listing is a new one created by the run (`docs/testing.md`: no test leans on a shared seeded listing's stock).
14. The Chromium suites pass; the new browser tests are also run once in Firefox and WebKit (`BROWSERS=all`) and any difference is recorded.

**Dependencies**
- Blocks: the vendor onboarding screens (`VEN-001`, `VEN-002`) would sit in the same app.
- Blocked by: the lead's decisions on the open points; nothing built (`WI-CAT-001`, `CAT-005`, `TAG-002`, `QUE-002`, `AUTH-007` are Done or In review).
- Can be worked in parallel with: the hardening items of `current-plan.md`.

**Verification**
Class V3 and J from `docs/process/verification-policy.md` section 2, with requirement 11 as the limits checklist. No new connection or resource; the rate of writes per vendor falls under the existing per-login limit (`WI-RATE-001`), to be confirmed in the BFF test.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full for the build once the open points are decided. Flag, do not choose: any change to `packages/web-session` (shared and security-sensitive), any change to catalog's authorization, and the catalog change of open point 2 or 3 if it grows past a precondition.

**Interfaces consumed**: catalog's listing endpoints above and `GET /catalog/tags`; the vendor app's existing `/api/graphql` route.
**Events published/consumed**: none new (catalog already raises `ListingPublished` and `LowStockDetected` on these writes).
**Data touched**: the vendor's own listing documents, through catalog only.

**Open Points (working)**
- [ ] **1. Where the screens live.** Recommended: in `apps/web-queue-display` (it is already the vendor's app: the vendor login, the session, the CSRF checks and the BFF route are there), with the app described as "the vendor's web app" from then on and a rename of the folder left for later. The other choice is a new `apps/web-vendor` that shares `packages/web-session`: a cleaner name, a second app to run, build and test.
- [ ] **2. Lost edits (register 208).** `PUT /catalog/listings/{id}` has no precondition from the caller: the service retries its own write against the latest copy and applies the request again, so a save from a form loaded before someone else's edit silently replaces that edit. Recommended: catalog returns the listing's `version` in the owner's view and takes it back as `If-Match` (or an `expectedVersion` field) on the edit, answering 409 `conflict` when it no longer matches; the service's own retry stays for changes the caller did not see (an order's reservation). A catalog change, small, with its own tests. The alternative is to accept last-write-wins for v1 and say so on the form.
- [ ] **3. Stock settings without the quantity (register 208).** A `stock` block on an edit replaces all three settings, and a missing `availableQuantity` means made to order, so changing only the most per order or the threshold must also send a quantity, which could undo sales made since the read (ADR-0017). Recommended: the edit's `stock` block may leave the quantity out for a counted listing to keep it (or a separate `PUT /stock/settings`), the quantity changes only by `adjust`, and switching between made to order and counted is an explicit choice. Until decided, requirement 5 and 7 keep the screens from sending a quantity on an edit.
- [ ] **4. Validation messages.** Catalog's 422 answers carry per-field sentences it writes itself (they never echo the input). Recommended: the BFF passes the field names and those sentences through as `INVALID`'s errors (they are client-safe and the form needs them); the alternative is a closed list of codes per field, mapped to sentences in the app, which duplicates catalog's limits in the client.
- [ ] **5. A duplicate draft from a repeated create.** With no delete, a second listing made by a retried create can only be hidden as a draft. Recommended for v1: the create's button stays disabled until an answer, and a timed-out create tells the vendor to check the list before trying again; an idempotency key on `POST /catalog/listings`, or a delete for drafts, is a later item if it matters.
- [ ] **6. The size.** Recommended: two items, built in order: `CAT-007a` the BFF operations and the catalog changes of points 2 and 3 (M), then `CAT-007b` the screens (M). One item is fine if the lead prefers one branch and one review.
- [ ] **7. Options in v1.** Editing options (name, price difference, allergens, tags) is in requirement 6 because a coffee or a bakery item without its options is half a listing, and because the edit must round-trip them anyway. They could be read-only in v1 to shrink the form.
