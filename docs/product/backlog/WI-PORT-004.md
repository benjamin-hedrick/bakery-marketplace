> **Status:** In review · built and run locally 2026-11-07 on `feature/listing-cache`; waiting for the lead's review (the stock-path diff of `WI-CAT-003`, register 158)
> **Outcome note (2026-11-07):** built as the table below says. Nothing new was cached (the BFF still has no cache). What was added: an explicit `Cache-Control` on the public listing reads (catalog `no-cache`, `ListingEndpoints.PublicCacheControl`) and on the two server-rendered listing pages (`private, no-store`, found or not, `getServerSideProps` of `index.tsx` and `listings/[id].tsx`); and the tests below. The record per active cache is the table, with the test names in its last column.
>
> **Verified (local):** catalog suite 329 passed and 8 skipped (Cosmos, Redis; 322 and 7 with Redis up at the time of `WI-CAT-003`); web mock-backed suite 143 passed (new: `tests/e2e/cache-headers.spec.ts`, 2 tests: the pages `/`, `/?tag=vegan`, a listing and a missing listing answer `private, no-store`; the GraphQL route answers `no-store`, the mock BFF now sends the real BFF's `private, no-store` so the proxy's pass-through is what is tested); real stack `skeleton-smoke.mjs` on the host 58 of 58 (new: `tests/skeleton/stale-cart-checkout.spec.ts`, an item added while in stock and sold out before checkout is refused with "none left" and the refused order took nothing).
>
> **Changes from the original plan:** the layer 2 stale-state test (a stale "in stock" refused at add and the page following) is `WI-CUST-009`'s, not repeated here. The authorization-isolation test is in the catalog (`PersonalizedListingApiTests`) because that is where the shared cache is; the browser-side isolation (one Relay environment per request) is `npm run test:isolation`, which already existed and **was not re-run** for this item. **Not done / open:** the session proxy's own refusals and 502s carried no `Cache-Control`: **resolved the same day** (register 159, the lead chose a `no-store` default for `/api/:path*` in both apps' `next.config.js`; tests in both apps' `cache-headers.spec.ts`, browser suites 144 and 61 passing; not asserted through the app: a stream keeping its own `no-store, no-transform`, and the 502 for an unreachable BFF); the BFF's cache policy is the existing `private, no-store` (tested in the BFF, not re-run here); no CDN is deployed, so layer 3 means the browser and any proxy only.

# WI-PORT-004 --- Cache contract for the listing path

```
WI ID:               PORT-004
Title:                Cache contract for the listing path (all three layers)
Type:                 Interface/Contract
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Architect / Engineering/Build (one owner)
Status:               In review
Size:                 S
```

**Decisions**: ADR-0014 (three layers), ADR-0002 (layer 1, with its 2026-11-07 amendments), ADR-0017 (stock is a status for customers).

**What this item does**
Writes down, as one record per active cache, and tests, what each of the three layers does on the listing path. It adds no new cache; the BFF stays without one (ADR-0014).

| Layer | Owner | Scope and key | Freshness | Invalidation | Failure behaviour | Privacy | Test |
|---|---|---|---|---|---|---|---|
| 1. Server | catalog-service (`ListingCache`) | verified vendor ids (`catalog:vendors:verified`); each vendor's published listing documents (`catalog:listings:vendor:{id}`) (`WI-CAT-003`) | 60 s (`ListingCache:TtlSeconds`, 0 is off) | a listing edit or create; a stock change that moves a listing's status (not every sale); a vendor verification change; a load that began before a write cannot fill the cache | a failing cache never fails a read or skips a filter (the load runs); a failed invalidation lives to the TTL; concurrent misses share one load (single flight), a failed load is not kept | public listing data; owner-only quantity and threshold are in the cached document and stripped by the DTO | `ListingCacheTests` (23), `ListingCacheConfigTests` (3), `ListingCacheRedisTests` (1) |
| 2. Relay store | web apps, one environment per SSR request and per browser session | normalized listing records, with `stock { status maxPerOrder }` | until refetched: list and detail may be shown from the store | adding to the order refetches the listing `network-only` (`WI-CUST-009`); mutations declare their updates (`WI-PORT-007`); the environment is discarded at logout | a failed refetch adds nothing and says so | a request's or a session's own store; never shared | `add-stock-check.spec.ts` (web, 4), `stock.test.ts` (Android, 5), `npm run test:isolation` (existing, not re-run) |
| 3. HTTP | catalog-service, Next.js pages and routes, the BFF | public listing reads; the two listing pages; GraphQL responses | none: nothing is reusable | not applicable | not applicable | catalog public reads `no-cache`; pages `private, no-store`; BFF GraphQL `private, no-store`; every other `/api` response `no-store` by default (`next.config.js`, register 159); stream `no-store, no-transform`; personalized catalog reads `no-store, private`; the tag registry `public, max-age=300` (no stock) | `PersonalizedListingApiTests` (headers), `TagApiTests`, `cache-headers.spec.ts`, the BFF's header tests |

**A server cache off the customer listing path (recorded, not changed here):** ordering-service's `ListingNameCache` (`Checkout/ListingNameCache.cs`, register 113) holds each listing's name and its modifiers' names, per ordering instance, read through the catalog's public listing read. Owner: ordering-service. Scope: names only, no price, stock or allergens; used to show names on the vendor's order view, never for checkout decisions. It is outside the table because no customer listing read uses it, and it reads through the catalog, so the catalog's cache sits behind it; its freshness, invalidation and test are in its own register entry. A change to what it holds (price, stock) would need an entry in this table.

**Rules this item pins down**
- Sold-out items are shown in browse with their status; there is no "hide out of stock" option. A sold-out item cannot be added; a stale "in stock" on a page is caught at add (layer 2 refetch) and at checkout.
- **Stock is checked twice, by two different layers:** at add to the order (fresh read, advisory) and at checkout (atomic reservation in catalog, ADR-0017, authoritative). Checkout does not trust anything in layers 2 or 3.
- Personalized data (allergen and diet matches, preferences) is never publicly cached and is not in the layer 1 cache; it is computed per request after the cached read.
- Order and cart data is never cached.
- The low-stock range is data (`StockPolicy.DefaultLowStockThreshold`, per-listing `lowStockThreshold`); changing it needs no cache change.

**Acceptance (met, see the outcome note for what was and was not run)**
- Each active cache has the record above with owner, scope/key, freshness, invalidation, failure behaviour, privacy classification and test names.
- Stale-state: a listing shown "in stock" that has since sold out is refused at add and the page updates (`WI-CUST-009`); an item already in the cart that sold out is refused at checkout with the shortfall (`stale-cart-checkout.spec.ts`).
- Authorization isolation: one customer's conflicts never reach another customer or the public through a warm cache (`A_warm_listing_cache_never_carries_one_customers_conflicts_to_another_or_to_the_public`); no personalized response is public (`Every_personalized_response_is_private_and_not_stored_by_any_cache`).
- Headers: public listing reads and the listing pages carry an explicit policy; authenticated GraphQL responses are `private, no-store`.
- No cache technology beyond these was proposed.

**Dependencies**
- Blocked by: `WI-CAT-003`, `WI-CUST-009` (both built).
