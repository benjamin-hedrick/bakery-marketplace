> **Status:** Ready

> **Rewritten 2026-11-07 to the current design (approved by the lead 2026-11-07).** The 2026-10-26 spec cached `GET /catalog/listings/{id}` only. Since then browse became the hot path (every browse and every personalized browse reads the published listings of every verified vendor and filters, sorts and pages in memory), listings gained stock, tags and allergens, and the personalized endpoints reuse the same read. This spec now caches the **source data** that all of those reads share, not an HTTP response. It stays **layer 1** of ADR-0014; ADR-0002's design is unchanged and gets a dated amendment note (2026-11-07) for the two points below that go beyond it. Git keeps the original.

```
WI ID:               CAT-003
Title:                Cache-aside for the published listings that browse and detail read
Type:                 Integration
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Engineering/Build
Status:               Ready
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
- Whether the cached vendor-listings read should use one key per vendor holding the full list (simple; recommended at first-slice scale) or one key per listing; revisit if a vendor's list grows large.
