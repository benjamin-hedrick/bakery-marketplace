> **Status:** Ready

> **Rewritten 2026-11-07 to the current design (approved by the lead 2026-11-07).** The earlier text listed the acceptance fields; this version says what each layer does on the listing path now that listings carry stock, tags and allergens and the personalized endpoints exist. Git keeps the original.

# WI-PORT-004 --- Cache contract for the listing path

```
WI ID:               PORT-004
Title:                Cache contract for the listing path (all three layers)
Type:                 Interface/Contract
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Architect / Engineering/Build (one owner)
Status:               Ready
Size:                 S
```

**Decisions**: ADR-0014 (three layers), ADR-0002 (layer 1, with its 2026-11-07 amendment), ADR-0017 (stock is a status for customers).

**Prerequisites:** `WI-CAT-003` (layer 1) and `WI-CUST-009` (the fresh stock check at add) are built or built together; listing contract and freshness triggers from `WI-PORT-007`. One owner.

**What this item does**
Writes down, as one record per active cache, and tests, what each of the three layers does on the listing path. It adds no new cache; the BFF stays without one (ADR-0014).

| Layer | Owner | Scope and key | Freshness | Invalidation | Failure behaviour | Privacy | Test |
|---|---|---|---|---|---|---|---|
| 1. Server | catalog-service | verified vendor ids; each vendor's published listing documents (`WI-CAT-003`) | 60 s | status change of a listing (not every sale), any listing edit or publish change, vendor verification change | falls back to local provider, then to Cosmos; filters always applied | public data; owner-only fields stripped by the DTO | `WI-CAT-003` tests |
| 2. Relay store | web apps, one environment per SSR request and per browser session | normalized listing records, with `stock { status maxPerOrder }` | until refetched: list and detail may be shown from the store | **adding to the order refetches the listing with `network-only`** (`WI-CUST-009`); mutations declare their updates (`WI-PORT-007`); the environment is discarded at logout | a failed refetch does not add silently (the customer is told, `WI-CUST-009`) | a request's or a session's own store; never shared | `WI-CUST-009` tests, SSR isolation test (`test:isolation`) |
| 3. HTTP | Next.js routes, BFF responses | public listing responses | none: nothing shared | not applicable | not applicable | any response that used a bearer token is `private, no-store`; **public listing responses set an explicit `Cache-Control` (`no-cache`)**, not the framework default; the tag registry keeps `public, max-age=300` (it carries no stock) | header tests on the catalog and BFF responses |

**Rules this item pins down**
- Sold-out items are shown in browse with their status; there is no "hide out of stock" option. A sold-out item cannot be added; a stale "in stock" on a page is caught at add (layer 2 refetch) and at checkout.
- **Stock is checked twice, by two different layers:** at add to the order (fresh read, advisory) and at checkout (atomic reservation in catalog, ADR-0017, authoritative). Checkout does not trust anything in layers 2 or 3.
- Personalized data (allergen and diet matches, preferences) is never publicly cached and is not in the layer 1 cache; it is computed per request after the cached read.
- Order and cart data is never cached.
- The low-stock range is data (`StockPolicy.DefaultLowStockThreshold`, per-listing `lowStockThreshold`); changing it needs no cache change.

**Acceptance**
- Each active cache has the record above filled in, in the as-built spec, with owner, scope/key, freshness, invalidation, failure behaviour, privacy classification and test names.
- Stale-state test: a listing shown "in stock" in the Relay store that has since sold out is refused at add and the page updates; a stale listing that slips past add is refused at checkout with the shortfall.
- Authorization-isolation test: a response for one customer (personalized browse) is never served to another, and no personalized response is `public`.
- Header tests: public listing responses carry an explicit policy; authenticated GraphQL responses are `private, no-store`.
- Any proposed cache technology beyond these names its use case and a measurement plan (none proposed).

**Dependencies**
- Blocked by: `WI-CAT-003`, `WI-CUST-009`.
