# WI-CAT-008 on the real local stack: the vendor's listing screens, and the customer sees each change

> **Status:** Done for the local stack · run by the AI agent on 2026-11-18 (local evening) on a developer machine (Windows 11, Docker Desktop with Compose, .NET 10, Node 25). The command and the code under test are at commit `8cf8595` on `feature/register-184-vendor-screens`.

**Command:** `node scripts/ci/skeleton-smoke.mjs` (from the repository root). **Starting state:** no host process running and no containers (the previous smoke had taken the stack down); the script brought up Redis (events), the Cosmos emulator, the mock issuer and the cache and sessions Redis in Compose, ran the seed (`Listings created: 10, already present: 0; VendorVerified events published: 2; customer profiles created: 4, already present: 0.`), started the catalog, ordering, the BFF, the customer web app (port 3000) and the vendor's web app (port 3100) as host processes, ran the Playwright journeys in one Chromium worker, and took everything down. Each new journey makes its own listing with a unique name through the vendor's form; nothing depends on what another journey left. Users, by the mock issuer's own login page: Corner Bakery (owner) (`vendor-shop-001`, verified by the seed), Homemade Treats (owner) (`vendor-indep-001`) and Alice Customer (`user-customer-1`).

## What was run

Five new journeys (`apps/web-customer/tests/skeleton/vendor-listings.spec.ts`), with the 62 journeys already in the smoke:

1. **The customer sees each change** (requirement 12). The vendor creates a draft from the form (Bread, $5.00, gluten, an option "Sliced" at $0.25, counted with 6): the customer's detail page for its id is a 404 (not on the menu). Published from the form: the customer's page shows $5.00 and In stock. Price changed to 5.75 from the form: the customer's page shows $5.75. **Sold out** from the list: the row shows "0 left · Sold out" and the customer's page Sold out. **Unpublish** from the list: the row shows Draft and the customer's page is a 404 again. The customer's pages are read through the customer web app (server-rendered from the BFF), so the catalog's cache invalidation is part of the path.
2. **Two tabs** (requirement 10): two tabs open the same listing; the first saves a new name; the second's save is refused with "This listing was changed since you opened it", keeps the name typed in it, and **Load the newer copy** shows the first tab's name.
3. **Another vendor's id** (requirements 10 and 12): Homemade Treats opens Corner Bakery's new listing by its address and gets "That listing could not be found"; the listing is not in their list.
4. **A removal racing a checkout** (requirement 10): a published listing with 1 left; the vendor clicks **Remove 1** while Alice's checkout for that unit is sent through the BFF at the same moment. Exactly one of the two took the unit (the test fails otherwise), the row ends at "0 left · Sold out", and if the checkout won the row says the count had changed. Which side won is not printed.
5. **The wrong caller** (requirement 10): Alice's login on the vendor's web app gets the forbidden message on `/listings`; a listing write posted with another origin is refused by the web app (403).

**Result:** 67 passed, exit code 0.

## Also run (on the same day, on this branch)

| Suite | Result |
|---|---|
| The vendor's web app, browser tests against the mock BFF, Chromium (`npm run test:e2e`) | 90 passed (64 before, 26 new in `tests/e2e/listings.spec.ts`) |
| The 26 new tests in Firefox and WebKit (`BROWSERS=firefox,webkit`) | 52 passed (26 in each); no difference from Chromium |
| The vendor's web app, unit (`node --test tests/unit/*.test.ts`) | 60 passed (12 new in `listings.test.ts`) |
| `node scripts/ci/node-gates.mjs` | 21 of 21 |

The first full smoke run with the new journeys (before `8cf8595`) failed the four that fill the form: the test looked up the allergen checkbox by the regular expression `/^Gluten/`, which Playwright compares with the label's raw text, and the label begins with the space before its text. The test now names the label in full; the product was not changed.

## Checks shown to fail when removed (requirement 11)

Each check that lives in the vendor's web app was removed in turn by a scratch script (the source edited, the guarding tests run against a fresh build, the source restored; nothing of it is in the repository):

| Check removed | What failed |
|---|---|
| The list treats a FORBIDDEN answer as an empty list (the vendor-only page) | "a login that is not a vendor's sees the forbidden message on the list and the form" |
| A counted listing that stays counted is sent with the count typed (ADR-0017) | the unit test of `toInput` that a counted edit is sent without a count |
| A new idempotency key for every attempt of a create | "a create clicked twice ... a retry after a lost answer returns the same listing" and "a create changed after one that did go through ..." |
| The save names a version other than the one the form was loaded at | the round-trip test, the edit-page adjustment test and "a save from an old copy ..." |
| The list asks the public `listings` field for the owner's fragment (owner-only fields from a public query) | the Relay compiler refuses it: "Invalid fragment spread 'ListingFields_listing', the type of this fragment ('MyListing') can never occur for parent type 'Listing'". The screens read only `MyListing`, a type the public queries do not return, so this is checked when the app is built |

Not mutated: the CSRF refusal, which is in the shared package `packages/web-session` (a change there needs the lead's approval, as in `WI-QUE-004`); the browser test and journey 5 show a write without the app's own origin is refused and reaches nothing. The role and the ownership are decided by the BFF and the catalog (`WI-CAT-007`'s checks), not by these pages.

Not done: Azure, a real identity provider, a screen reader by hand (the accessibility checks are axe's automatic rules on the list, the empty list, the form and the form with errors).

## Raw output of the Playwright run

```
Running 67 tests using 1 worker

  ✓   1 tests\skeleton\add-stock-check.spec.ts:10:5 › an item the bakery sold out after the page loaded is not added, and the customer is told (669ms)
  ✓   2 tests\skeleton\cancel-orders.spec.ts:67:5 › a customer cancels a new order: it is cancelled, the stock comes back, and only that customer can do it, once (2.9s)
  ✓   3 tests\skeleton\cancel-orders.spec.ts:92:5 › a customer cannot cancel once the bakery has started on the order (438ms)
  ✓   4 tests\skeleton\cancel-orders.spec.ts:111:5 › the vendor cancels an order it had accepted, from the queue display; the customer sees it cancelled and the stock comes back (1.5s)
  ✓   5 tests\skeleton\cancel-orders.spec.ts:137:5 › in the browser the customer cancels a waiting order from its page and the page then says it is cancelled (902ms)
  ✓   6 tests\skeleton\checkout-allergens.spec.ts:37:5 › a customer allergic to tree nuts is warned about the croissant, must acknowledge, and the bakery is told with the order (1.3s)
  ✓   7 tests\skeleton\checkout-allergens.spec.ts:81:5 › a cart with no conflict for the same customer (tree nuts, dairy) has nothing to acknowledge, and an option not chosen is not named (829ms)
  ✓   8 tests\skeleton\diet-preferences.spec.ts:32:5 › a preferred diet is saved, and a listing is marked or not by the rule, with the options chosen (69ms)
  ✓   9 tests\skeleton\diet-preferences.spec.ts:61:5 › an id that is not a diet is refused by name, and a vendor token is refused the profile (44ms)
  ✓  10 tests\skeleton\diet-preferences.spec.ts:72:5 › the browser shows the bakery’s claim on the browse page for a customer who prefers a diet (610ms)
  ✓  11 tests\skeleton\issuer.spec.ts:13:5 › the registered callback gets the login page (14ms)
  ✓  12 tests\skeleton\issuer.spec.ts:19:5 › a redirect_uri that is not registered is refused and not echoed (20ms)
  ✓  13 tests\skeleton\issuer.spec.ts:32:5 › a crafted state cannot inject markup into the login page, and still comes back unchanged (21ms)
  ✓  14 tests\skeleton\journey.spec.ts:47:5 › a plain order: browse, choose, log in, order, and it is confirmed by itself (1.8s)
  ✓  15 tests\skeleton\journey.spec.ts:101:5 › an order with an option and a pickup time waits for the bakery, with the option and the time shown (1.1s)
  ✓  16 tests\skeleton\journey.spec.ts:128:5 › a payment method with an invalid token is declined, keeps the order and takes nothing; another method then goes through (1.3s)
  ✓  17 tests\skeleton\journey.spec.ts:156:5 › asking for more than is in stock says how many are left, and taking that many works (1.3s)
  ✓  18 tests\skeleton\journey.spec.ts:195:5 › a sold-out item cannot be ordered (412ms)
  ✓  19 tests\skeleton\journey.spec.ts:208:5 › the journey produces no console warnings or errors (777ms)
  ✓  20 tests\skeleton\listing-tags.spec.ts:24:5 › the seeded listings carry their tags through the catalog and the BFF, with the kind and the label (13ms)
  ✓  21 tests\skeleton\listing-tags.spec.ts:43:5 › the hidden platform tag is in no public response: not on the listing, not in the registry, not in the BFF (16ms)
  ✓  22 tests\skeleton\listing-tags.spec.ts:53:5 › allergens are not tags: no allergen id is among a listing’s tags (11ms)
  ✓  23 tests\skeleton\listing-tags.spec.ts:61:5 › the browser shows the chips on the server-rendered browse page (278ms)
  ✓  24 tests\skeleton\listing-tags.spec.ts:74:5 › the BFF narrows the seeded listings by a tag, by two tags, and an unusable tag is refused the same way for any reason (66ms)
  ✓  25 tests\skeleton\listing-tags.spec.ts:108:5 › the browser filters the server-rendered home page by a tag, and a refused tag leads back to the whole list (328ms)
  ✓  26 tests\skeleton\login.spec.ts:14:5 › a customer logs in through the real issuer, holds only an opaque cookie, and logging out ends the session on the server (708ms)
  ✓  27 tests\skeleton\login.spec.ts:52:5 › a callback with no login in progress is refused and nothing is exchanged (71ms)
  ✓  28 tests\skeleton\order-allergens.spec.ts:55:5 › an order placed with allergens shows them to its customer and to the vendor who has it, and not to anyone else (414ms)
  ✓  29 tests\skeleton\order-allergens.spec.ts:81:5 › an order with no allergens has an empty list (75ms)
  ✓  30 tests\skeleton\order-allergens.spec.ts:91:5 › an allergen the registry does not offer is refused by name and no order is placed (16ms)
  ✓  31 tests\skeleton\order-history.spec.ts:30:5 › an order placed in the browser is the newest row of the history, and the history pages (1.1s)
  ✓  32 tests\skeleton\order-history.spec.ts:62:5 › a vendor’s token is refused the customer’s order list, and no token gets nothing (25ms)
  ✓  33 tests\skeleton\personalized.spec.ts:44:5 › the seeded catalog shows the customer’s conflicts, in the public order, and hiding removes only item-level ones (87ms)
  ✓  34 tests\skeleton\personalized.spec.ts:72:5 › one listing with its conflicts, and a cart check that counts only the options chosen (80ms)
  ✓  35 tests\skeleton\personalized.spec.ts:101:5 › a vendor’s token is refused the personalized views, no token gets nothing, and the public list still works without one (68ms)
  ✓  36 tests\skeleton\preferences.spec.ts:35:5 › a customer saves an allergen profile, reads it back, replaces it and clears it, on the real services (152ms)
  ✓  37 tests\skeleton\preferences.spec.ts:59:5 › an id that is not on offer, and an allergen in both lists, are refused by name and nothing is saved (79ms)
  ✓  38 tests\skeleton\preferences.spec.ts:76:5 › a vendor’s token is refused the profile, and no token gets nothing (53ms)
  ✓  39 tests\skeleton\profile-page.spec.ts:48:5 › a customer sets an allergy in the browser, it comes back after a reload, and the seeded catalog is marked from it (1.2s)
  ✓  40 tests\skeleton\profile-page.spec.ts:100:5 › clearing the profile in the browser removes the marks (1.2s)
  ✓  41 tests\skeleton\profile-page.spec.ts:120:5 › a vendor’s login is refused the profile page, which shows no choices, and the public page is unchanged (1.0s)
  ✓  42 tests\skeleton\queue-allergens.spec.ts:44:5 › the vendor’s live queue shows an order’s allergens with the registry’s labels, and an order without them shows nothing extra (757ms)
  ✓  43 tests\skeleton\stack.spec.ts:41:5 › ordering-service is up, and the BFF reaches it for pickup times (18ms)
  ✓  44 tests\skeleton\stack.spec.ts:51:5 › ordering validates the token itself: no token, a forged one and a vendor token are all refused through the BFF (37ms)
  ✓  45 tests\skeleton\stack.spec.ts:65:5 › a customer token from the real issuer is accepted by ordering: an unknown order is null, not an error (21ms)
  ✓  46 tests\skeleton\stack.spec.ts:79:5 › ordering reaches the catalog with its own credential: a plain order is placed, confirmed, readable by its customer, and takes one from stock (159ms)
  ✓  47 tests\skeleton\stack.spec.ts:105:5 › a method whose token is invalid (Alice's seeded refused method) is declined and takes nothing from stock (98ms)
  ✓  48 tests\skeleton\stack.spec.ts:125:5 › the payment methods of a customer are listed without a token, and another customer cannot use them (66ms)
  ✓  49 tests\skeleton\stale-cart-checkout.spec.ts:15:5 › an item sold out after it was added is refused at checkout with the shortfall, and nothing is taken (965ms)
  ✓  50 tests\skeleton\tags.spec.ts:8:5 › the allergen list reaches the BFF from the real catalog, in order, with no login (13ms)
  ✓  51 tests\skeleton\tags.spec.ts:29:5 › the seeded listings still show their allergen flags, which are all registry ids (38ms)
  ✓  52 tests\skeleton\vendor-actions.spec.ts:65:5 › the vendor accepts, starts, readies and hands over an order from the buttons, and the customer sees each step; a decline cancels (2.1s)
  ✓  53 tests\skeleton\vendor-actions.spec.ts:105:5 › the real services refuse the wrong caller: another vendor gets not found, a customer is forbidden, a repeated action is not allowed now (344ms)
  ✓  54 tests\skeleton\vendor-listings.spec.ts:74:5 › a vendor creates, publishes, reprices, sells out and unpublishes a listing, and the customer sees each change (2.2s)
  ✓  55 tests\skeleton\vendor-listings.spec.ts:108:5 › two tabs edit the same listing: the second save is refused and offers the newer copy (1.5s)
  ✓  56 tests\skeleton\vendor-listings.spec.ts:133:5 › another vendor’s listing in the address is not found, and is not in their list (1.5s)
  ✓  57 tests\skeleton\vendor-listings.spec.ts:153:5 › a stock removal racing a customer’s checkout for the last unit: one wins, and the screen shows the result (1.3s)
  ✓  58 tests\skeleton\vendor-listings.spec.ts:202:5 › the vendor’s pages refuse a customer’s login and a write without the app’s own origin (528ms)
[live] order visible 63 ms after the request was sent
  ✓  59 tests\skeleton\vendor-live.spec.ts:83:5 › the vendor screen is Live on the real stack, and an order and each action on it arrive by push, well inside the 60-second check (1.1s)
[live-delay] {"orders":20,"requestToScreenMs":{"n":20,"min":75,"p50":107,"p95":126,"max":127},"responseToScreenMs":{"n":20,"min":15,"p50":46,"p95":68,"max":68},"eventToScreenMs":{"n":20,"min":61,"p50":91,"p95":113,"max":114}}
  ✓  60 tests\skeleton\vendor-live.spec.ts:121:5 › measures the delay from a customer placing an order to the vendor seeing it, on the real stack (8.9s)
  ✓  61 tests\skeleton\vendor-queue.spec.ts:17:5 › an order the customer places shows up on the vendor queue screen, carried by the events and the vendor read model (741ms)
  ✓  62 tests\skeleton\vendor-queue.spec.ts:71:5 › another customer-role login cannot see a vendor queue (502ms)
  ✓  63 tests\skeleton\walking-skeleton.spec.ts:22:5 › seeded listings are server-rendered from the real catalog, and the draft is not shown (267ms)
  ✓  64 tests\skeleton\walking-skeleton.spec.ts:34:5 › hydration is clean and first paint makes no browser-side GraphQL request (737ms)
  ✓  65 tests\skeleton\walking-skeleton.spec.ts:53:5 › detail page shows allergen flags and modifier prices from the service (341ms)
  ✓  66 tests\skeleton\walking-skeleton.spec.ts:65:5 › a listing that is not public renders not-found, not an error page (199ms)
  ✓  67 tests\skeleton\walking-skeleton.spec.ts:70:5 › the BFF is the only API surface the browser can reach and answers with a trace id and no-store (16ms)

  67 passed (49.7s)
[skeleton] Playwright exit code 0
```
