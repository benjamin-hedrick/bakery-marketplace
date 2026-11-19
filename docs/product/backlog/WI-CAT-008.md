> **Status:** In review · evidence: the Outcome note under this banner; `docs/evidence/WI-CAT-008/` · waiting for the review

> **Outcome note (2026-11-18):** built on `feature/register-184-vendor-screens`, not merged, on `WI-CAT-007`'s operations (nothing new in the BFF or in `packages/web-session`). The vendor's web app (`apps/web-queue-display`, the name used in its README and `local-dev.md`) has `/listings` (price, status, stock, when it changed; filters, paging, an empty state; **Add**, **Remove** and **Sold out** as adjustments only, a removal past zero showing the count as it is now; **Publish** and **Unpublish** saving only the status with the row's edit version) and `/listings/new` and `/listings/[id]` (the form, the catalog's sentences beside their fields and in a summary, the edit version on every save with `CHANGED` keeping what was typed and offering the newer copy, a counted listing saved without a count, one idempotency key per create page, `KEY_REUSED` answered by repeating the earlier attempts to find and link the listing that was made, a tag the registry no longer offers kept), and header links between the queue and the listings. Tests: 12 unit, 26 browser tests against the mock BFF (queue display 90 in all; the 26 also pass in Firefox and WebKit, no difference), axe on the list, the empty list, the form and the form with errors; five journeys on the real stack in the skeleton smoke (67 of 67 at `8cf8595`: a vendor's draft, publish, price, sold out and unpublish each seen on the customer's detail page; two tabs; another vendor's id; a removal racing a checkout; a customer's login and a write without the origin). The in-app checks (the forbidden page, no count on a counted edit, one key per create, the loaded edit version) were each removed and caught; reading the owner's fields through the public query is refused by the Relay compiler; the CSRF refusal belongs to `packages/web-session` and was not mutated. Evidence: `docs/evidence/WI-CAT-008/real-stack-2026-11-18.md`. Not done: Azure, a real identity provider, a screen reader by hand.

```
WI ID:                CAT-008
Title:                The vendor's listing and stock screens: list, create, edit, publish and adjust stock in the vendor's web app
Type:                 Frontend
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-QUEUE-DISPLAY (the screens are pages of the vendor's web app, `apps/web-queue-display`)
Hat/Owner:            Engineering/Build, Digital PM (the form and its wording)
Status:               In review
Size:                 M
Verification class:   V3 + J (state-changing actions by a role, across the browser, the web app, the BFF and catalog). The classes are proposed in `docs/process/verification-policy.md` (register item 130); the vendor items follow them as a trial.
```
ADRs and NFRs affected: ADR-0013 (the screens call the BFF only), ADR-0017 (the screen never sends a quantity it read earlier), ADR-0019 (the writes go through the session and the CSRF checks of `/api/graphql`), ADR-0022 (the closed allergen list and the tag registry), ADR-0014 (the vendor's own reads are `private, no-store`); NFR 3.1 and 3.3.

**Context / Why**
The largest product gap (`current-plan.md`, Next item 1): a vendor can work their orders in the vendor's web app (`WI-QUE-002` to `QUE-005`), but every listing, price, allergen and stock figure comes from the seed. This item gives the vendor the screens, on the operations of `WI-CAT-007`, and closes the loop the demo cannot show today: a vendor changes a listing and the customer sees it.

**Inputs / References**
- *Operations*: `WI-CAT-007` (the BFF's `myListings`, `myListing`, `createListing`, `updateListing`, `adjustListingStock`; the edit version; the stock `mode`; the idempotency key; the `ListingRejected` codes) and the BFF's existing `tags` query for the allergen and tag choices. That query is public and leaves out hidden tags and tags outside their window, so the form offers only those it returns and round-trips any other tag a listing already carries (shown, not removable by accident).
- *The app*: `apps/web-queue-display` (login, session, CSRF, the Relay network function with its timeout, the mock BFF and the fake issuer for its browser tests, `RequireLogin`, the site header).
- *Validation*: catalog's, passed through by the BFF (`WI-CAT-007` requirement 9); the limits are in `ListingValidator.cs` and shown here only as hints.
- *Test methodology*: `docs/process/test-strategy.md`, `docs/process/verification-policy.md`, `docs/process/playwright-guide.md`, `docs/testing.md` (a test brings its own named seed data).

**You do not need to know about**
- Catalog's internals, the order side, the vendor queue's stream.
- The customer app's pages, beyond seeing that a change reaches them in the evidence run.

**Out of scope**
- Photos; deleting or archiving a listing (a vendor takes a listing off sale by putting it back to Draft); vendor onboarding and staff accounts; pickup windows; sponsored placement; sales figures; bulk import or export; a mobile screen for vendors.
- Renaming the `apps/web-queue-display` folder (decision 1: later).

**Requirements / Acceptance Criteria**
1. **Where** (decision 1). Pages of the vendor's web app: `/listings` (the list), `/listings/new` and `/listings/[id]` (edit), behind the app's existing login and the vendor role, with links between the queue and the listings in the site header. The app's README and `docs/operations/local-dev.md` call it "the vendor's web app" from here on (the folder keeps its name).
2. **The list.** Each of the vendor's listings with its name, price, Draft or Published, its stock (made to order, or the quantity with In stock, Low or Sold out) and when it last changed; filtered by Draft or Published; paged. An empty list says how to add the first listing.
3. **Stock from the list.** For a counted listing: add or remove a number of units, and **Sold out**, which removes the quantity shown; each is one `adjustListingStock`. A removal past zero (`INSUFFICIENT_STOCK`) shows the current quantity again with a sentence saying it had changed. The screen never sends an absolute quantity it read earlier (ADR-0017).
4. **The form** (create and edit): name, description, category, price in dollars and cents (sent as cents), the allergens from the closed list as checkboxes (ADR-0022), the other tags from the registry, the options (decision 7: add, edit and remove; name, price difference, allergens, tags), made to order or counted (the starting quantity on create or when switching to counted; the most per order and the low-stock threshold), and Draft or Published. Catalog's errors (`INVALID`) appear beside their fields and in a summary at the top, and the form keeps what the vendor typed.
5. **An edit is safe** (decisions 2 and 3). The form sends the edit version it loaded; a `CHANGED` answer keeps what the vendor typed and offers to load the newer copy (showing what changed is not required). The form round-trips every field it loaded (a missing options list would clear the options); on an edit of a counted listing it sends the stock settings without a quantity, and the quantity is changed only by the list's stock controls or an adjustment on the edit page.
6. **A create is safe** (decision 5). The create page makes one idempotency key when it opens and sends it with every attempt of that create, so a retry after a timeout or a double click returns the same listing; a new key is made only for a new, empty form. A `KEY_REUSED` answer (the vendor changed the form after a create that did go through) says the listing was already created and links to it.
7. **Publishing.** Publish and unpublish are the form's status, and a button on the list that saves only the status (with the edit version). An unverified vendor's publish shows "Your shop must be verified before a listing can go live", and the listing stays a draft.
8. **No double effect.** While a write is in flight its controls are disabled; a failure re-enables them and says what happened in words, not codes.
9. **Accessible.** Real labels on every field, errors tied to their fields (`aria-describedby`) and announced, every control reachable by keyboard, the listing's name in each row control's accessible name ("Remove 1 from Almond Croissant"), and no automatically detectable accessibility violation on the list, the empty list, the form and the form with errors.
10. **Abuse and failure cases, each with a test** (browser tests against the mock BFF unless stated): another vendor's listing id in the address (not found); a customer's session (forbidden page); no session (the login); a hostile id in the address; a value at and past each limit (catalog's message shown); a stock removal racing a customer's checkout (one wins, the screen shows the result; on the real stack); two tabs editing the same listing (the second save gets `CHANGED`; on the real stack); a create clicked twice and retried after a timeout (one listing); a write without the session's CSRF headers (refused by the web app, nothing reaches the BFF); the BFF slow or down (the network function's timeout, a message, Try again).
11. **Security-property tests** (the CSRF refusal through the shared package, the vendor-only pages, the owner-only fields never rendered from a public query) are shown to fail with the check removed where the check is in this app, and the outcome note says how.
12. **The customer sees it.** An evidence run on the real stack from a stated starting state, recorded with the commit, command, date and raw output under `docs/evidence/WI-CAT-008/`: a seeded vendor creates a draft with an option (not on the customer's menu), publishes it (on the menu), changes its price (the customer's detail page shows the new price), sells it out from the list (the customer sees Sold out) and puts it back to Draft (off the menu); two tabs editing it; another vendor's id refused. The listing is one the run creates (`docs/testing.md`).
13. The Chromium suites pass; the new browser tests are also run once in Firefox and WebKit (`BROWSERS=all`) and any difference is recorded. The real-stack smoke (`skeleton-smoke.mjs`) still passes.

**Dependencies**
- Blocks: the vendor onboarding screens (`VEN-001`, `VEN-002`) would sit in the same app.
- Blocked by: `WI-CAT-007`.
- Can be worked in parallel with: nothing on the same app.

**Verification**
Class V3 and J from `docs/process/verification-policy.md` section 2, with requirement 10 as the limits checklist. No new connection or resource.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full. Flag, do not choose: any change to `packages/web-session` (shared and security-sensitive) and any need for an operation `WI-CAT-007` does not provide.

**Interfaces consumed**: the BFF operations of `WI-CAT-007` through the app's existing `/api/graphql` route.
**Events published/consumed**: none.
**Data touched**: none directly.

**Open Points (working)**
- [x] Decisions 1 to 7: decided by the lead 2026-11-18, recorded in `WI-CAT-007`.
