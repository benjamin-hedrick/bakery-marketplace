```
WI ID:               CAT-003
Title:                Cache-aside integration for listing reads
Type:                 Integration
Epic:                 EPIC-CATALOG
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED (minor).** Retained as **layer 1** (server/data-source) of ADR-0014's three cache layers; ADR-0002's design is unchanged. **Addition**: record this cache's owner, key/scope, freshness (60s TTL), invalidation trigger, failure behavior (resilient local fallback), privacy classification (public listing data only) and test, per ADR-0014. `WI-PORT-004` documents it alongside the Relay and HTTP layers. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
ADR-0002 scopes caching to catalog/search reads specifically. This item wires `CAT-001`'s read endpoints through `ICacheProvider`'s cache-aside pattern.

**Inputs / References**
- *Decisions*: ADR-0002 (cache-aside, 60s default TTL, catalog/search only — never order/cart data)
- *Interfaces*: `ICacheProvider`/`ResilientCacheProvider` (`CACHE-001`/`003`), `CAT-001`'s read endpoints
- *Environment/tooling*: local Redis via `--profile with-redis`, or `LocalCacheProvider` by default
- *Test/chaos methodology*: not a new adapter — reuses `CACHE-001`'s existing contract; this item's own tests confirm cache-aside behavior at the integration point
- *Business context*: none

**You do not need to know about**
- `ICacheProvider`'s internal implementation — this item is a consumer, not a backend author

**Out of scope**
- Does not cache order/cart data — explicitly excluded by ADR-0002
- Does not modify `ICacheProvider`, `ResilientCacheProvider`, or `ChaosCacheProvider`

**Requirements / Acceptance Criteria**
- `GET /catalog/listings/{id}` checks cache first, falls back to `CosmosRepository` on miss, writes back with the ADR-0002 default TTL
- A `PUT`/publish action invalidates (deletes) the corresponding cache entry, so stale reads aren't served indefinitely past a write
- Integration test proving: cold read misses and populates cache; warm read hits cache without touching the repository; write invalidates the entry

**Dependencies**
- Blocked by: `CAT-001`, `CACHE-002`
- Can be worked in parallel with: `ORD-001`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Systems/contexts being integrated**: `catalog-service` ↔ `ICacheProvider`
**Contract being relied on**: `ICacheProvider`'s Get/Set/Delete contract (`CACHE-001`) not changing without notice

**Open Points (working)**
*(none currently)*
