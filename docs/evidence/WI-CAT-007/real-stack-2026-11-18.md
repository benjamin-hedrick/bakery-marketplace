# WI-CAT-007 on the real local stack: the vendor's listing writes through the BFF

> **Status:** Done for the local stack · run by the AI agent on 2026-11-18 (local evening; the run's own timestamp below is UTC) on a developer machine (Windows 11, Docker Desktop with Compose, .NET 10, Node 25). The script and the code under test are at commit `62611fd` on `feature/register-184-vendor-screens`.

**Command:** `node scripts/dev/vendor-listing-run.mjs` (from the repository root). **Starting state:** the Compose containers were already running (started earlier in the session for the Cosmos tests) with no host process running; the script brought Compose up (a no-op apart from recreating the mock issuer), checked it, ran the seed (10 listings created and none already present, so the seed's own listings were not there before; 2 `VendorVerified` events), started the catalog, ordering and BFF as host processes, and stopped them at the end. Signed-in users, by the mock issuer: `vendor-shop-001` and `vendor-indep-001` (verified by the seed), `user-vendor-1` (a vendor the seed does not verify) and `user-customer-1` (a customer). The listing the steps work on is one the run creates with a new idempotency key. No browser; every step is one GraphQL operation sent to the BFF, which calls the real catalog service on Cosmos.

## What was run

Requirement 13's steps, and a few more: create with a key (1), repeat it (2, the same listing), the key with another listing (3, `KEY_REUSED`), edit with the current edit version (4), edit from the old copy (5, `CHANGED` with the current version 2), an adjustment as sales would make (6, the edit version unchanged), a change of the threshold and the most per order of the counted listing with no quantity sent (7, the count kept at 6), a counted edit that sends a quantity (8, refused with the catalog's sentence), publish as a verified vendor (9), the public read with no token (10, the stock status only), another vendor's edit, adjustment and read (11 to 13, not found), a customer's read (14, `FORBIDDEN`), no token (15, `UNAUTHENTICATED`), a vendor that is not verified publishing (16, `VENDOR_NOT_VERIFIED`), the owner's read at the end (17), and an allergen the catalog does not know (18, for register 210).

**Result:** 18 steps, 0 failed; exit code 0.

**What step 18 shows (register 210):** the real catalog's sentence for an unknown allergen repeats the value the vendor sent (`'<b>nuts</b>' is not a known allergen. ...`), and the BFF passes it through unchanged, as decision 4 says. Requirement 9's premise that the catalog's sentences never echo the input is not true for this sentence and the tag sentences; the lead decides (register 210).

## Security checks shown to fail with the check removed (requirement 12)

Each check was removed in turn by a script (the source edited, the mutant built and confirmed to compile, the guarding tests run, the source restored; nothing of it is in the repository). Every mutant was caught:

| Check removed | Tests that failed |
|---|---|
| Role: an edit (`PUT`) needs any signed-in caller instead of the Vendor role | `ListingApiTests.Writes_require_the_vendor_role` (2 cases), `ListingEditPreconditionTests.TheRoleAndOwnershipChecksStillComeFirst` |
| Role: a create (`POST`) needs any signed-in caller | `ListingApiTests.Writes_require_the_vendor_role` (2 cases) |
| Ownership: an edit finds the listing among all published listings and skips the ownership requirement | 5, among them `ListingApiTests.Seeded_vendors_are_editable_only_by_their_own_mock_user` and `ListingEditPreconditionTests.TheRoleAndOwnershipChecksStillComeFirst` |
| Owner-only fields: the catalog's public view built as the owner's view | `ListingEditPreconditionTests.ThePublicViewNeverCarriesTheEditVersion`, `ListingStockTests.PublicReadsShowTheStatusAndMaxPerOrder_NeverTheCount` |
| Owner-only fields: the public GraphQL `Listing` gains `editVersion` | BFF `vendor-listings.test.ts`: "has none of the owner's fields, and MyListing is not a Node" |
| Precondition: the edit version not compared | 4 of `ListingEditPreconditionTests` (stale, ahead, ten concurrent edits, the retry after another edit) |
| Precondition: a missing `If-Match` taken as edit version 1 | 10 of `ListingEditPreconditionTests` (missing, the eight malformed values including `*`, two values) |
| Precondition: the BFF does not send `If-Match` | BFF `vendor-listings.test.ts`: 2 (the header sent, the 428 mapping) |
| Key reuse: a stored listing answers any request with its key | `ListingIdempotentCreateTests.TheSameKeyWithAnotherRequestIsRefused_AndChangesNothing` |
| Repeat: the listing id not derived from the key | 6 of `ListingIdempotentCreateTests` (repeat, repeat after an edit, ten concurrent creates, the id, reuse) |

## The tests, after the change

| Suite | Result |
|---|---|
| Catalog (`services/catalog-service/tests/CatalogService.Tests`), with `REDIS_CONNECTION_STRING=127.0.0.1:6379` and `COSMOS_CONNECTION_STRING` set | 393 passed, 0 skipped (the new ones are `ListingEditPreconditionTests`, `ListingIdempotentCreateTests`, the stock-mode tests in `ListingStockTests` and the Cosmos race in `CosmosCatalogTests`) |
| BFF (`services/graphql-bff`, `npm test`) | 302 passed (35 new in `vendor-listings.test.ts`) |
| `node scripts/ci/node-gates.mjs` | 21 of 21 (including both apps' Relay compile against the new schema) |

Not run here: a browser (the screens are `WI-CAT-008`), Azure, a real identity provider.

## Raw output of the run

The Compose, build and seed lines before the run are left out; the run's own lines are complete.

```
vendor listing run, 2026-11-19T01:52:33.023Z; BFF http://localhost:4100/graphql; idempotency key run-179ec11f-652a-480b-9fb6-c47e6eee4707

### 1. Create a counted draft with a new key
as: vendor-shop-001
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":900,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3}},"key":"run-179ec11f-652a-480b-9fb6-c47e6eee4707"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"DRAFT","price":{"cents":900},"editVersion":1,"stock":{"status":"IN_STOCK","maxPerOrder":4,"availableQuantity":10,"lowStockThreshold":3}}}}}
check: PASS

### 2. Repeat the same create (a retry after a timeout)
as: vendor-shop-001
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":900,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3}},"key":"run-179ec11f-652a-480b-9fb6-c47e6eee4707"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"DRAFT","price":{"cents":900},"editVersion":1,"stock":{"status":"IN_STOCK","maxPerOrder":4,"availableQuantity":10,"lowStockThreshold":3}}}}}
check: PASS

### 3. The same key with a different listing
as: vendor-shop-001
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":1,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3}},"key":"run-179ec11f-652a-480b-9fb6-c47e6eee4707"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingRejected","code":"KEY_REUSED","message":"This form was already used to create a different listing. Start a new listing.","fields":[],"currentEditVersion":null}}}
check: PASS

### 4. Edit with the current edit version (1): price 950
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":950,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":null},"v":1}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"DRAFT","price":{"cents":950},"editVersion":2,"stock":{"status":"IN_STOCK","maxPerOrder":4,"availableQuantity":10,"lowStockThreshold":3}}}}}
check: PASS

### 5. Edit from the old copy (version 1): refused
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":1,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":null},"v":1}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingRejected","code":"CHANGED","message":"This listing was changed since you opened it. Reload it and try again.","fields":[],"currentEditVersion":2}}}
check: PASS

### 6. Adjust the count by -4 (as sales would)
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","delta":-4}
HTTP 200: {"data":{"adjustListingStock":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"DRAFT","price":{"cents":950},"editVersion":2,"stock":{"status":"IN_STOCK","maxPerOrder":4,"availableQuantity":6,"lowStockThreshold":3}}}}}
check: PASS

### 7. Change the threshold and the most per order of the counted listing (no quantity sent)
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":950,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":{"mode":"COUNTED","maxPerOrder":2,"lowStockThreshold":6}},"v":2}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"DRAFT","price":{"cents":950},"editVersion":3,"stock":{"status":"LOW","maxPerOrder":2,"availableQuantity":6,"lowStockThreshold":6}}}}}
check: PASS

### 8. A counted edit that sends a quantity: refused with the catalog’s sentence
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":950,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":50}},"v":3}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingRejected","code":"INVALID","message":"The listing could not be saved as entered.","fields":[{"field":"stock.availableQuantity","message":"Change the quantity with an adjustment."}],"currentEditVersion":null}}}
check: PASS

### 9. Publish as a verified vendor
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":950,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"PUBLISHED","stock":null},"v":3}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingWriteSuccess","listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"PUBLISHED","price":{"cents":950},"editVersion":4,"stock":{"status":"LOW","maxPerOrder":2,"availableQuantity":6,"lowStockThreshold":6}}}}}
check: PASS

### 10. The published listing as anyone sees it (no token)
as: nobody
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy"}
HTTP 200: {"data":{"listing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","price":{"cents":950},"stock":{"status":"LOW","maxPerOrder":2}}}}
check: PASS

### 11. Another vendor edits the listing
as: vendor-indep-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":1,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"DRAFT","stock":null},"v":4}
HTTP 200: {"data":{"updateListing":{"__typename":"ListingRejected","code":"NOT_FOUND","message":"That listing could not be found.","fields":[],"currentEditVersion":null}}}
check: PASS

### 12. Another vendor adjusts the listing
as: vendor-indep-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","delta":100}
HTTP 200: {"data":{"adjustListingStock":{"__typename":"ListingRejected","code":"NOT_FOUND","message":"That listing could not be found.","fields":[],"currentEditVersion":null}}}
check: PASS

### 13. Another vendor reads the listing as their own
as: vendor-indep-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy"}
HTTP 200: {"data":{"myListing":null}}
check: PASS

### 14. A customer reads it as their own listing
as: user-customer-1
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy"}
HTTP 200: {"errors":[{"message":"You do not have access to this.","locations":[{"line":1,"column":24}],"path":["myListing"],"extensions":{"code":"FORBIDDEN"}}],"data":{"myListing":null}}
check: PASS

### 15. No token
as: nobody
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","delta":1}
HTTP 200: {"errors":[{"message":"Please log in to continue.","locations":[{"line":1,"column":43}],"path":["adjustListingStock"],"extensions":{"code":"UNAUTHENTICATED"}}],"data":null}
check: PASS

### 16. A vendor that is not verified publishes
as: user-vendor-1
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":900,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten"],"status":"PUBLISHED","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3}},"key":"run-abda2d79-767d-4bde-a1ce-716a83a6c3fa"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingRejected","code":"VENDOR_NOT_VERIFIED","message":"Only a verified bakery can publish a listing. You can save it as a draft.","fields":[],"currentEditVersion":null}}}
check: PASS

### 17. The owner reads it back
as: vendor-shop-001
variables: {"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy"}
HTTP 200: {"data":{"myListing":{"id":"TGlzdGluZzpsaXN0aW5nLWJiYzdlMTlhZTI0MWY1MTUyOGZhNzc0NTg0MWE5MDEy","name":"Rye Sourdough (vendor listing run)","status":"PUBLISHED","price":{"cents":950},"editVersion":4,"stock":{"status":"LOW","maxPerOrder":2,"availableQuantity":6,"lowStockThreshold":6}}}}
check: PASS

### 18. An allergen the catalog does not know (register 210)
as: vendor-shop-001
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":900,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["<b>nuts</b>"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3}},"key":"run-4dbbb5d8-bc62-4e74-8ef7-a3fb1131e508"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingRejected","code":"INVALID","message":"The listing could not be saved as entered.","fields":[{"field":"allergenFlags","message":"'<b>nuts</b>' is not a known allergen. Use one of: dairy, egg, fish, shellfish, tree-nut, peanut, gluten, soy, sesame."}],"currentEditVersion":null}}}
check: PASS

18 steps, 0 failed
```

## Re-run after register 210 was resolved

The lead chose option (a) for register 210: the catalog now reports a refused allergen or tag at its position with a sentence that does not repeat it (commit `cf39c87`). The same command was run again at `cf39c87`, from the same kind of starting state (Compose already running, the seed run again by the script, a new listing and key). Step 18 now sends an unknown allergen and an unknown tag and checks that each is reported at its position (`allergenFlags[1]`, `tags[0]`) and that the value is nowhere in the answer.

**Result:** 18 steps, 0 failed; exit code 0. Steps 1 to 17 answered as in the first run. Raw output of the header line and step 18:

```
vendor listing run, 2026-11-19T02:16:27.925Z; BFF http://localhost:4100/graphql; idempotency key run-067f24cf-5ee6-4d3f-b318-35e8fe1e8d7c
...
### 18. An allergen and a tag the catalog does not offer: refused at their positions, the value not repeated (register 210)
as: vendor-shop-001
variables: {"input":{"name":"Rye Sourdough (vendor listing run)","category":"Bread","priceCents":900,"modifiers":[{"id":"mod-seeds","name":"Seed crust","priceDeltaCents":100,"allergens":["sesame"]}],"allergenFlags":["gluten","<b>nuts</b>"],"status":"DRAFT","stock":{"mode":"COUNTED","availableQuantity":10,"maxPerOrder":4,"lowStockThreshold":3},"tags":["<b>nuts</b>"]},"key":"run-6713879c-d020-47de-84d4-cdec9a602718"}
HTTP 200: {"data":{"createListing":{"__typename":"ListingRejected","code":"INVALID","message":"The listing could not be saved as entered.","fields":[{"field":"allergenFlags[1]","message":"Not an allergen the catalog knows. Use one of: dairy, egg, fish, shellfish, tree-nut, peanut, gluten, soy, sesame."},{"field":"tags[0]","message":"Not a tag the catalog offers."}],"currentEditVersion":null}}}
check: PASS

18 steps, 0 failed
```
