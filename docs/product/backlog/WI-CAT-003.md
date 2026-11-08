> **Status:** In review · built and run locally 2026-11-07 on `feature/listing-cache` (22 new tests; browse about 20 ms to about 3 ms at p50, `docs/evidence/WI-CAT-003/after-2026-11-07.md`); waiting for the lead's review of the stock-path diff (register 158 item 4)

> **Update 2026-11-08 (documentation pass):** `WI-CUST-009` and `WI-PORT-004`, named below as separate items, are built (In review).

> **Outcome note (2026-11-07):** built as the design below says. `ListingCache` (`services/catalog-service/src/Services/ListingCache.cs`) wraps `ICacheProvider` and holds two kinds of entry: the verified vendor ids (`catalog:vendors:verified`) and each vendor's published listings (`catalog:listings:vendor:{id}`), 60 s by default (`ListingCache:TtlSeconds`; 0 turns it off). `ListingService` reads through it for browse and detail; the personalized endpoints and the tag filter sit on those reads. It is deleted for a vendor by: any listing create or edit (`ListingService`), a reserve, release or adjust **that changes the listing's status** (`StockReservationService`, `ListingService.AdjustStockAsync`; a sale that keeps the status invalidates nothing), and a vendor verification change (`VendorStatusStore.ApplyAsync`, which also drops the vendor list). `Cache:Backend` is `local` (the default) or `redis` (`Cache:Redis:ConnectionString`, default `localhost:6380`, `abortConnect=false` added) behind `ResilientCacheProvider`; any other value stops the start. Owner-only fields (quantity, threshold) are in the cached document and leave only through the DTO projection. **Per-cache record (ADR-0014):** owner catalog-service; keys above; freshness 60 s; invalidation as listed; failure behaviour: a failing cache never fails a read (the load function runs, the filters still apply) and a failed invalidation is logged and lives until the TTL; privacy: public listing data, owner-only fields stripped by the DTO; tests **Stampede protection (added 2026-11-07, the lead's request):** `ListingCache` loads once per key at a time: the first miss starts the load and concurrent misses wait for its result (single flight), so fifty concurrent cold reads make one read of the store. The load does not run under any caller's cancellation (a caller that cancels stops waiting, the others still get the result) and has its own timeout (`ListingCache:LoadTimeoutSeconds`, 30); a failed load is shared by the callers waiting on it and not kept; the load looks at the cache again before reading the store, so a late miss does not start a second one. A per-key generation closes a race that existed without it: an invalidation drops the load in flight and bumps the generation, so a request after a write starts its own load and a load that began before the write cannot fill the cache afterwards. Mutation checks, each failing the intended tests: no coalescing, no generation guard, an invalidation that keeps the load in flight. `ListingCacheTests` (23: the 17 below and 6 for this: cold reads coalesce, a cancelling caller, a failed load, a load that began before a write, a request after a write, the cache off; the first 17: cold and warm, detail, off switch, parity with the uncached service over pages and cursors, no invalidation on a same-status sale, invalidation on low and sold out and back, adjustments, edits, publish and unpublish, new listing, suspension and reverification, an unverified vendor never served, a failing cache, the resilient fallback, the customer view without quantity or threshold), `ListingCacheConfigTests` (3: a bad backend stops the start; the real event path reaches the cache with `local` and with an unreachable cache Redis) and `ListingCacheRedisTests` (1: the listing read back from Redis is the same listing and the same customer view; skipped without Redis).
>
> **Verified (local):** catalog suite 322 passed and 7 skipped (Cosmos) with Redis up, 321 passed and 8 skipped without it; mutation checks, each failing the intended tests: reserve and release never invalidate, always invalidate, an edit that does not invalidate, a verification change that does not drop the vendor list. Latency, three runs each: browse (BFF) p50 26.4, 18.9, 19.9 ms without the cache and 2.6, 3.1, 3.5 ms with it; the home page 32.5, 24.1, 23.8 ms and 8.2, 8.3, 10.1 ms; checkout and pickup windows unchanged within the spread.
>
> **Changes from the original plan:** the 2026-11-07 rewrite (below) replaced the single-listing cache; the item is size M, not S. **Not done / limits:** the in-process provider only was measured, not the Redis provider (the Redis path is covered for correctness, not speed); stampede protection is per process (replicas each load once); with several replicas an invalidation reaches only its own replica, bounded by the TTL; one cache entry per vendor holds the whole list (decided; revisit for a large vendor); the cache Redis is not configured in the dev Terraform or Compose for the catalog yet (the default is the local provider); `WI-CUST-009` (the fresh stock read at add) and `WI-PORT-004` are not built.

> **Rewritten 2026-11-07 to the current design (approved by the lead 2026-11-07).** The 2026-10-26 spec cached `GET /catalog/listings/{id}` only. Since then browse became the hot path (every browse and every personalized browse reads the published listings of every verified vendor and filters, sorts and pages in memory), listings gained stock, tags and allergens, and the personalized endpoints reuse the same read. This spec now caches the **source data** that all of those reads share, not an HTTP response. It stays **layer 1** of ADR-0014; ADR-0002's design is unchanged and gets a dated amendment note (2026-11-07) for the two points below that go beyond it. Git keeps the original.

```
WI ID:               CAT-003
Title:                Cache-aside for the published listings that browse and detail read
Type:                 Integration
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
```

**Context / Why**
ADR-0002 scopes caching to catalog reads. `ListingService.BrowseAsync` runs one Cosmos query per verified vendor on every call, and `GetPublicAsync` walks the vendors until it finds the listing; the personalized `for-me` endpoints and the tag filter sit on top of the same reads. Caching the source documents lets all of them benefit while personalization (allergen matches, diet matches) is still computed per request and never cached.

**Inputs / References**
- *Decisions*: ADR-0002 (cache-aside, 60s TTL, catalog only, never order or cart data; amendment 2026-11-07), ADR-0014 (layer 1 and the per-cache record), ADR-0017 (stock is a status for customers, the count is the vendor's).
- *Interfaces*: `ICacheProvider` / `ResilientCacheProvider` (`tools/BakeryMarketplace.Caching`), `ListingService`, `StockReservationService`, `VendorStatusStore`.
- *Environment*: `CACHE_BACKEND=local` by default, Redis with `--profile with-redis`.

**You do not need to know about**
- The cache providers' internals: this item is a consumer.

**Out of scope**
- Does not change `ICacheProvider`, `ResilientCacheProvider` or `ChaosCacheProvider`.
- Does not cache order or cart data, preferences, personalization results or any response body.
- Does not cache the vendor's own reads (`/mine`, `/mine/{id}`): the vendor needs the exact current quantity.
- No "hide out of stock" option: sold-out items stay in browse with their status (lead's decision 2026-11-07).
- The customer's fresh stock check when adding to the order is `WI-CUST-009`.

**Design**
- **What is cached (source data, public listings only):** (a) the verified vendor ids, key `catalog:vendors:verified`; (b) each vendor's published listing documents, key `catalog:listings:vendor:{vendorId}`. Browse, the tag filter, detail and the personalized endpoints read these through a cache-aside wrapper in `ListingService`; they apply paging, tag and conflict filters and the DTO projection after the read.
- **Freshness:** 60 seconds (ADR-0002 default), as the upper bound.
- **The document holds the exact quantity and threshold, so stock needs no invalidation on every sale.** Customers see a status (`inStock`, `low`, `soldOut`), derived at read time from the cached quantity and threshold by `StockPolicy.StatusOf`. A reserve, release or vendor adjustment that leaves the **status** unchanged (500 in stock, 1 bought) does not touch the cache. The cached quantity then drifts from the real one, and that is safe because nothing a customer sees uses it: checkout's atomic reserve (ADR-0017) is the authority and reports shortfalls itself. The cached quantity is never used for a decision.
- **Invalidation (delete the vendor's key):**
  - when a reserve, release or adjust **changes the status** (compare `StatusOf` before and after; the same test already raises `LowStockDetected`): in stock to low, low to sold out, and back;
  - on any listing create, edit or publish/unpublish (price, name, tags, allergens, `maxPerOrder`, `lowStockThreshold`, status);
  - delete `catalog:vendors:verified` when a vendor's verification changes (`VendorEventSubscriptions`), and that vendor's listing key.
  - Made-to-order listings have no quantity and never trigger a stock invalidation.
- **Failure behaviour:** `ResilientCacheProvider` falls back to the local provider; if both miss, the read goes to Cosmos. A cache error never fails a read and never skips the published and verified-vendor filters (they are applied on what the cache returns and on a miss alike). With several replicas on the local fallback an invalidation reaches only its own replica, so staleness is bounded by the 60 s TTL (the limitation ADR-0002 accepts).
- **Privacy classification:** public listing data, but the cached document also holds owner-only fields (exact quantity, threshold). They are stripped by `ListingDto.From` before anything leaves the service, as today; this is recorded and tested, not changed.
- **Changing the low-stock range later** is a constant (`StockPolicy.DefaultLowStockThreshold`) or per-listing data change. Because status is derived after the cache read, a new default takes effect within one TTL with no cache change; a per-listing change is a listing edit and invalidates.

**Requirements / Acceptance Criteria**
- A cold browse and a cold detail read populate the cache; a warm one reads no repository (counted through a counting repository fake).
- A reserve of 1 from 500 does not invalidate; a reserve or adjust that moves a listing into low, or to sold out, and a release that moves it back, invalidates and the next read shows the new status.
- An edit, a publish or unpublish and a vendor verification change invalidate; a never-published, draft or unverified-vendor listing is never returned from a warm cache.
- With the primary cache failing (chaos decorator), reads still succeed from the local provider or the repository and the filters still hold.
- Responses are identical with and without the cache for the same data (a test runs both and compares), including paging cursors and the tag filter.
- A customer response never contains `availableQuantity` or `lowStockThreshold` (a test on the cached path).
- Per-cache record (ADR-0014) written in the as-built spec: owner (catalog-service), key and scope, freshness, invalidation triggers, failure behaviour, privacy classification, test names.
- Works against the in-memory and the Redis provider (the integration test runs with `REDIS_CONNECTION_STRING=127.0.0.1:6379` and Redis up; skipped otherwise, and the report says which ran).
- Measured: browse latency before and after on the local stack (`scripts/dev/measure-latency.mjs`), recorded as evidence; no claim of improvement without the numbers.

**Dependencies**
- Blocked by: none (`CAT-001`, `CAT-005`, `CAT-006` and the caching library are built).
- Related: `WI-PORT-004` (the contract across the three layers), `WI-CUST-009`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes, except that the invalidation points touch stock code (ADR-0017): the lead reviews that diff.

**Open Points (working)**
- Decided by the lead 2026-11-07: one key per vendor holding the full list, not one per listing. Revisit if a vendor's list grows large or single-listing reads dominate.
