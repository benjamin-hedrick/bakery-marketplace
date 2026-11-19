> **Status:** In review · evidence: the Outcome note under this banner; `docs/evidence/WI-CAT-007/` · waiting for the lead's decision on register 210 and the review

> **Outcome note (2026-11-18):** built on `feature/register-184-vendor-screens`, not merged. Catalog: listing documents carry `editVersion` (1 on create, moved on only by an edit; a stored document without it reads as 1), the owner's view and single-listing answers carry it (`ETag`), and `PUT` requires `If-Match` (428 missing or unusable, 409 `version_mismatch` with the current version; the retry after a store conflict re-checks it, so a reservation or adjustment in between lets the edit through and another edit does not). The stock block has `mode`; a counted edit keeps the stored quantity and refuses one ("Change the quantity with an adjustment."), each switch is handled, and an edit's block needs a mode (the lead, 2026-11-18). `POST` requires `Idempotency-Key`: the id is a hash of the vendor and the key, the write is create-only, a repeat answers 200 with the listing as it is now and a reuse 422 `idempotency_key_reuse`; the request's fingerprint is stored and never returned. BFF: `myListings`, `myListing` and a `MyListing` type of its own; `createListing`, `updateListing`, `adjustListingStock` with `ListingRejected` codes; mapping only, the catalog's field sentences passed through. Tests: catalog 393 of 393 with Redis and the Cosmos emulator (new: the precondition, the stock modes, the idempotent create, a race of creates on the emulator), BFF 302 (35 new), node gates 21 of 21. The ten security checks of requirement 12 (the role on create and edit, ownership, the owner-only fields in the catalog and in the schema, the version compare, a missing `If-Match`, the BFF sending it, key reuse, the derived id) were each removed in turn and each was caught by failing tests. The real-stack run through the BFF (`scripts/dev/vendor-listing-run.mjs`, 18 steps, all passed) is in `docs/evidence/WI-CAT-007/real-stack-2026-11-18.md`. **Found while building:** requirement 9's premise does not hold for two kinds of catalog sentence (an unknown allergen, a refused tag), which repeat the vendor's value; the run shows it on the real catalog; register 210, for the lead. Register 209 (a tracing test failed once) was opened in the same work. Not done: the screens (`WI-CAT-008`), any run on Azure or with a real identity provider.

```
WI ID:                CAT-007
Title:                Safe listing writes for the vendor's screens: an edit precondition, stock settings without the quantity, an idempotent create, and the BFF operations
Type:                 Service Implementation (catalog) and BFF operations
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-QUEUE-DISPLAY (the client is the vendor's web app, `WI-CAT-008`)
Hat/Owner:            Engineering/Build, Architect (the API contract)
Status:               In review
Size:                 M
Verification class:   V3 (state-changing writes by a role, across the BFF and catalog; the browser half is `WI-CAT-008`). The classes are proposed in `docs/process/verification-policy.md` (register item 130); the vendor items follow them as a trial.
```
ADRs and NFRs affected: ADR-0006 and ADR-0008 (catalog decides who owns a listing, even behind the BFF), ADR-0013 (the BFF is composition and error mapping only), ADR-0017 (the quantity changes only by atomic steps; checkout's reservation decides), ADR-0019 (the writes go through the session and the CSRF checks of the web app's `/api/graphql`), ADR-0022 (the allergen list and the tag registry), ADR-0002 and ADR-0014 (an edit invalidates the listing cache; the vendor's own reads are never cached); NFR 3.1, 3.3 and 3.4.

**Context / Why**
The vendor's listing and stock screens (`WI-CAT-008`, the largest product gap in `current-plan.md`) need write operations a person can use safely. The catalog endpoints exist (`WI-CAT-001`, `CAT-005`, `TAG-002`) but were only ever called by the seed and the tests, and drafting the screens found three ways a person at a form would lose data (register 208, plus open point 5 of the first draft): a save from a stale form overwrites a newer edit; an edit that changes only the most per order or the low-stock threshold must also send a quantity, which can put sold units back on sale; and a create retried after a timeout makes a second listing that cannot be deleted. This item closes them in catalog and gives the BFF the operations the screens call. It builds no screen.

**Inputs / References**
- *Decisions*: ADR-0006, ADR-0008, ADR-0013, ADR-0017, ADR-0019, ADR-0022; register 208.
- *Interfaces today* (`services/catalog-service/src/Api/ListingEndpoints.cs`, `ListingDtos.cs`): `GET /catalog/listings/mine`, `GET /catalog/listings/mine/{id}` (owner view, exact quantity and threshold), `POST /catalog/listings` (201), `PUT /catalog/listings/{id}` (200; the service re-applies the request to the latest copy on a store conflict, `ListingService.UpdateAsync`), `POST /catalog/listings/{id}/stock/adjust` (atomic delta), `GET /catalog/tags`. Errors: 422 `validation_failed` with per-field sentences, 409 `vendor_not_verified`, `made_to_order`, `insufficient_stock`, `conflict`; 404 for a missing or another vendor's listing.
- *Pattern to reuse*: checkout's idempotency (`services/ordering-service/src/Checkout/CheckoutService.cs`, decision D-6): the id is derived from (owner, key) by a hash, a create-only write decides a race, and a fingerprint of the request tells a repeat from a reuse of the key (422 `idempotency_key_reuse`).
- *BFF*: `services/graphql-bff/schema/schema.graphql` and the vendor operations of `WI-QUE-004` (union payloads, fixed client-safe messages, global ids).
- *Test methodology*: `docs/process/test-strategy.md`, `docs/process/verification-policy.md`, `docs/testing.md` (a test brings its own data).

**You do not need to know about**
- The order side, the vendor queue, the customer app.
- The screens (`WI-CAT-008`), beyond the operations they call.

**Out of scope**
- Any screen (`WI-CAT-008`).
- Deleting or archiving a listing; photos; vendor onboarding (`VEN-001`, `VEN-002`).
- A precondition on the stock `adjust` (it is an atomic delta; no read is overwritten).

**Requirements / Acceptance Criteria**
*Catalog: the edit precondition (register 208, decision 2)*
1. Listing documents gain an **edit version** (`editVersion`, 1 on create), incremented only by an edit (`PUT`). The document's `version` is not used: it is the event sequence and every reservation, release and adjust increments it (`StockReservationService`, `ListingService.AdjustStockAsync`), so comparing it would make a vendor's open form stale after every sale. Documents stored before this change read as edit version 1. The owner's view of a listing (`ListingDto.ForOwner`, the `/mine` reads and every write's answer) carries `editVersion`; a single-listing owner answer also sends it as `ETag: "<editVersion>"`. The public view does not.
2. `PUT /catalog/listings/{id}` requires `If-Match: "<editVersion>"`. Missing: 428 `precondition_required`. Not the current edit version: 409 `version_mismatch` with the current one in the body, and nothing written. The service's own retry after a store conflict stays, and re-checks the edit version on the fresh copy: a reservation or an adjust between the read and the edit lets the edit through (they change only the quantity, which an edit never sends, requirement 4); another edit does not.

*Catalog: stock settings without the quantity (register 208, decision 3)*
3. The edit's `stock` block gains `mode`: `madeToOrder` or `counted`. On an edit of a counted listing that stays counted, `availableQuantity` is not allowed (422 on that field: "Change the quantity with an adjustment"); `maxPerOrder` and `lowStockThreshold` are set as given and the stored quantity is kept. Switching from made to order to counted needs a starting `availableQuantity`; switching to made to order drops the quantity. A missing `stock` block still leaves all stock settings as they are. On create, `availableQuantity` is the starting quantity, as today.
4. The quantity of a counted listing changes only through `POST .../stock/adjust`.

*Catalog: an idempotent create (decision 5)*
5. `POST /catalog/listings` requires `Idempotency-Key` (1 to 100 visible ASCII characters; missing or malformed: 422 on `idempotencyKey`). The listing id is derived from (vendor id, key) by a hash, as checkout derives its order id, so the key itself is never in an id or a log; the write is create-only, so two racing creates make one listing. A repeat with the same request answers 200 with the listing as it is now; the same key with a different request answers 422 `idempotency_key_reuse`. The request's fingerprint is stored with the listing and never returned.

*Catalog: tests and callers*
6. The catalog service tests that create or edit listings send the new headers through their helpers; no test loses an assertion. New tests: the precondition (missing, stale, current, and a reservation between the read and the edit), the stock modes (each switch, a quantity on a counted edit refused, settings kept), the idempotent create (repeat, reuse, a race of two creates against the Cosmos emulator when `COSMOS_CONNECTION_STRING` is set). The cache invalidation and the events on these writes are unchanged and still tested.

*BFF*
7. Reads: `Query.myListings(status: MyListingFilter, first: Int = 20, after: String): MyListingConnection!` and `Query.myListing(id: ID!): MyListing` (null when missing or another vendor's). `MyListing` is a type of its own, not the public `Listing`, so the quantity, the threshold and the version can never reach a customer's query through a shared fragment. Answers are `private, no-store`.
8. Writes: `createListing(input, idempotencyKey: String!)`, `updateListing(input, expectedEditVersion)`, `adjustListingStock(id, delta)`, each a union payload. Success carries the `MyListing`. An expected refusal is `ListingRejected` with a code: `INVALID` (with errors per field), `NOT_FOUND`, `VENDOR_NOT_VERIFIED`, `CHANGED` (version mismatch, or catalog's `conflict`; with the current version when catalog gives it), `MADE_TO_ORDER`, `INSUFFICIENT_STOCK`, `KEY_REUSED`. No token is `UNAUTHENTICATED`, a token without the vendor role `FORBIDDEN`, anything else a generic error, as for the other operations.
9. Validation messages (decision 4): `INVALID` carries catalog's field names and catalog's own sentences unchanged. They are fixed strings that never echo the input; a BFF test asserts that a hostile value in the request is not in the answer.
10. The BFF holds no listing rule: it does not check a price, choose a status or a stock mode, compute a delta or a version, or make up an idempotency key (the client sends it). It forwards the caller's token unchanged, decodes and encodes global ids (an undecodable id is `NOT_FOUND` without a call), and passes `If-Match` and `Idempotency-Key` through.
11. **Abuse and failure cases, each with a test:** another vendor's listing (not found, in the BFF test and against the real catalog); a customer's token (forbidden); no token; a hostile id; a large or malformed body (the existing limits hold); a price, a quantity and a delta at and past their limits; an edit with a stale version; a counted edit carrying a quantity; a create repeated, raced and reused; catalog down or slow (the BFF's bounded wait, a generic error).
12. **Security-property tests** (the role, the ownership, the owner-only fields absent from the public type and the public answer, the precondition, the key reuse) are shown to fail with the check removed, and the outcome note says how.
13. A run against the real catalog through the BFF (no browser), from a stated starting state, recorded under `docs/evidence/WI-CAT-007/` with the commit, command, date and raw output: create with a key, repeat it (same listing), edit with the current version, edit with the old one (`CHANGED`), change the threshold of a counted listing (quantity kept), adjust, publish as a verified vendor, another vendor's id refused. The listing is one the run creates.

**Dependencies**
- Blocks: `WI-CAT-008` (the screens).
- Blocked by: none (`WI-CAT-001`, `CAT-005`, `TAG-002` are Done).
- Can be worked in parallel with: the hardening items of `current-plan.md`.

**Verification**
Class V3 from `docs/process/verification-policy.md` section 2, with requirement 11 as the limits checklist. No new connection or resource. The rate of writes per vendor falls under the existing per-login limit (`WI-RATE-001`); a BFF test confirms the writes are counted.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Full. Flag, do not choose: any change to catalog's authorization or to `packages/web-session`; any write path other than an edit that would need to increment the edit version.

**Interfaces consumed**: catalog's listing endpoints and `GET /catalog/tags`.
**Interfaces changed**: `PUT /catalog/listings/{id}` (requires `If-Match`; the `stock` block's `mode`), `POST /catalog/listings` (requires `Idempotency-Key`), the owner view (`editVersion`); `docs/architecture/data-model-api-contracts.md` is updated with them.
**Events published/consumed**: none new (catalog already raises `ListingPublished` and `LowStockDetected` on these writes).
**Data touched**: listing documents gain `editVersion` and the create's fingerprint (never returned).

**Open Points (decided by the lead, 2026-11-18)**
- [x] **1. Where the screens live:** in the vendor's existing web app, `apps/web-queue-display`, called "the vendor's web app" in the docs; the folder keeps its name for now. (`WI-CAT-008`.)
- [x] **2. Lost edits (register 208):** a version precondition, `If-Match` on the edit, 409 when it no longer matches (requirements 1 and 2).
- [x] **3. Stock settings without the quantity (register 208):** an edit may leave the quantity out and keep the stored one; the quantity changes only by `adjust`; made to order or counted is an explicit `mode` (requirements 3 and 4).
- [x] **4. Validation messages:** passed through from catalog (requirement 9).
- [x] **5. A duplicate from a repeated create:** an idempotency key on `POST /catalog/listings`, as checkout has (requirement 5). (Recommended was "disable and warn"; the lead chose the key.)
- [x] **6. The size:** two items, built in order on one branch: this one (catalog and BFF), then `WI-CAT-008` (the screens).
- [x] **7. Options in v1:** editable (`WI-CAT-008`).
- [x] Which version the precondition compares: a separate edit version (requirement 1), because reservations, releases and adjusts all increment the document's `version` (checked in the code 2026-11-18).
