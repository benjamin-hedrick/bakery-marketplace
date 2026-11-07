# ADR-0002: Cache Strategy — Environment-Conditional Managed Redis with Local Fallback

**Status:** Accepted, amended 2026-09-11 to 2026-10-30

## Context

Catalog and search are the read-heavy, latency-sensitive paths in the system and are the intended caching targets. Azure Cache for Redis has no permanent free tier, which conflicts with the free-tier-first principle for dev/demo environments (see `tech-stack.md`). At the same time, a fully local-only cache in every environment would understate a real production concern and forgo a legitimate resilience story (degraded-but-available cache beats no cache strategy at all).

The design needs to satisfy three things at once: near-zero cost in dev/demo, a real managed-Redis path in staging/prod, and graceful behavior when Redis is deployed but temporarily unreachable.

## Decision

Two independent switches, kept deliberately separate:

**1. Deploy-time (Terraform)** — whether managed Redis exists in an environment at all:

```hcl
variable "enable_managed_redis" {
  type    = bool
  default = false
}

resource "azurerm_redis_cache" "cache" {
  count    = var.enable_managed_redis ? 1 : 0
  name     = "bakery-cache-${var.environment}"
  sku_name = "Basic"
  capacity = 0
}

locals {
  cache_backend = var.enable_managed_redis ? "redis" : "local"
  redis_conn    = var.enable_managed_redis ? azurerm_redis_cache.cache[0].primary_connection_string : ""
}
```

`dev.tfvars`: `enable_managed_redis = false`. `staging.tfvars` / `prod.tfvars`: `enable_managed_redis = true`. `local.cache_backend` / `local.redis_conn` feed the app's Container Apps environment config.

**2. Runtime (application)** — which backend is actually in use right now, independent of what's deployed:

```
CacheProvider (interface: get, set, delete, exists)
 ├─ RedisCacheProvider   — talks to Azure Cache for Redis
 └─ LocalCacheProvider   — in-process LRU map, no external dependency

ResilientCacheProvider (decorator, wraps the configured primary)
 ├─ on success → passthrough
 └─ on failure/timeout → trip circuit breaker → route to LocalCacheProvider
                          → emit a metric/log event
                          → periodically probe primary; close breaker on recovery
```

Selected via `CACHE_BACKEND=redis|local` config. The `ResilientCacheProvider` wraps whichever is primary and falls through to `LocalCacheProvider` on failure **regardless of `CACHE_BACKEND`** — this is what gives graceful degradation even when Redis is deployed and configured but momentarily unreachable.

**Pattern**: cache-aside. App checks cache, falls back to source on miss, writes result back with a short default TTL (60s). No write-through/explicit invalidation-on-write for v1 — revisit if staleness proves to be a real problem. **What's cached**: catalog listings and search results only — order/cart data is never cached.

**Local dev** mirrors the same toggle via Compose profiles:
- `docker-compose up` (default) → no Redis container, `CACHE_BACKEND=local`
- `docker-compose --profile with-redis up` → Redis container present, `CACHE_BACKEND=redis`

**Testing**: a `FakeCacheProvider` for fast unit tests; a shared contract-test suite run against both `RedisCacheProvider` and `LocalCacheProvider` to catch behavioral drift between adapters; integration tests against a real Redis container via the `with-redis` profile. A `ChaosCacheProvider` decorator (wraps either real provider) injects latency, forced errors, and outage windows, used specifically to prove the `ResilientCacheProvider`'s circuit breaker actually falls through and recovers. Chaos mode is gated so `ENVIRONMENT=production` + `CHAOS_MODE=true` fails config validation at startup, not just "off by default."

## Consequences

**Positive**
- Dev/demo runs at $0 with zero external dependency; staging/prod get a real managed-Redis path for a few dollars/month
- Resilience is demonstrated, not just claimed — chaos tests exercise the actual fallback path
- Deploy-time and runtime concerns stay decoupled, so an operator can force local-only in staging (e.g., during a Redis incident) without a Terraform change

**Negative / accepted limitations**
- `LocalCacheProvider` is in-process. In a horizontally-scaled deployment (multiple Container Apps replicas), each replica has its own local cache — **this is a fallback for resilience, not a substitute for shared-cache consistency.** Under a sustained Redis outage with multiple replicas, cache hit rates drop and replicas can briefly disagree on cached values (bounded by the 60s TTL). This is an accepted tradeoff for degraded-but-available behavior, not an oversight.
- Cache-aside + short TTL means staleness up to 60s is possible by design; acceptable for catalog/search, would not be acceptable if cache scope ever expanded to order/pricing data (explicitly excluded above).

## Alternatives considered

1. **Redis in every environment, including dev.** Rejected — conflicts with the free-tier-first principle; no meaningful benefit for a single-developer local loop.
2. **Local-only cache everywhere, no managed Redis at all.** Rejected — forgoes a legitimate production concern and the resilience story; would look like cost-avoidance rather than an architectural decision if reviewed.
3. **Write-through caching with explicit invalidation.** Rejected for v1 — more correct but meaningfully more complex; cache-aside with short TTL is adequate for the read patterns involved and easier to reason about.
4. **A distributed local cache (e.g., gossip-based) instead of per-replica local cache.** Rejected — significant added complexity for a fallback path that's only exercised during a Redis outage; the accepted-limitation framing above is a better cost/benefit than building this.

## Related

- `tech-stack.md` — free-tier-first principle, environment-conditional pattern
- ADR-0001 — same "adapter + fallback, not hard dependency" posture applied to Fulfillment
- ADR-0003 (event-driven backbone, next) — expected to reuse this same three-layer pattern (adapter → contract tests → chaos decorator)

## Amendment note (Redis vendor under reconsideration)

The specific managed cache vendor (Azure Cache for Redis) is under reconsideration and may change. **This does not affect this ADR's core design.** The `CacheProvider` interface, `LocalCacheProvider`, `ResilientCacheProvider` fallback decorator, and the contract-test suite are all vendor-agnostic — none of them know or care which managed service backs the "cloud" implementation. Only `CACHE-002` (the concrete `RedisCacheProvider` implementation) and `CACHE-005` (the Terraform `enable_managed_redis` toggle) are vendor-specific and held from work until the vendor decision is finalized — see `docs/governance/open-items-register.md` item #22.

## Amendment note (ADR-0014 — cache layers, 2026-10-26)

ADR-0014 names this ADR's cache as **layer 1 (server/data-source)** of three, and adds governance for the Relay client store (layer 2) and HTTP/browser/CDN caching (layer 3) introduced by ADR-0012/0013. **Nothing in this ADR's design changes**: `ICacheProvider`, the Redis/local providers, `ResilientCacheProvider`, `ChaosCacheProvider`, cache-aside on listings and search, the 60s TTL, and the rule that order/cart data is never cached all stand. The one addition: each cache entry point (e.g. `WI-CAT-003`'s listing reads) now records owner, key/scope, freshness, invalidation, failure behavior, privacy classification and a test, per ADR-0014.

## Amendment note (2026-10-30: what is wired)

The decision is unchanged. The server cache is a library in `tools/BakeryMarketplace.Caching` (`ICacheProvider`, a Redis provider, `LocalCacheProvider` on `IMemoryCache`, `ResilientCacheProvider`, `ChaosCacheProvider`) with a shared contract-test base; its 16 tests passed on 2026-10-30. **No service uses it as a cache yet**: the catalog cache-aside (`WI-CAT-003`) is not built. The Terraform snippet in this ADR (`enable_managed_redis`) is not in `infra/`, which has only the Key Vault module. The local fallback is described here as an LRU map; the implementation is `IMemoryCache`.

## Amendment note (2026-11-07: what is cached, and invalidation)

The decision is unchanged: cache-aside, a 60 second TTL, catalog data only, order and cart data never cached. Two points go beyond the text above. (1) **Scope of the cache entry:** the catalog cache holds the source documents that listing reads share (the verified vendor ids and each vendor's published listings), not response bodies, so the browse, detail, tag-filter and personalized reads all use it while personalization is computed per request and never cached (`WI-CAT-003`). (2) **Explicit invalidation:** the decision text rejects write-through for v1; the catalog deletes a vendor's cached listings when a listing is edited or published, when a vendor's verification changes, and when a stock change alters a listing's **status** (in stock, low, sold out). A stock change that leaves the status alone (one unit sold from 500) does not invalidate: customers see a status, not the count, and checkout's atomic reservation is the authority (ADR-0017). The 60 second TTL stays the upper bound, so the accepted staleness limit above is unchanged. The fresh read at add-to-order is `WI-CUST-009`; the per-layer record is `WI-PORT-004`.

## Amendment note (2026-11-07: the catalog uses the cache)

The note of 2026-10-30 above said no service uses the cache yet. As of 2026-11-07 catalog-service does (`WI-CAT-003`, In review): `Cache:Backend` is `local` or `redis` behind `ResilientCacheProvider`, `ListingCache:TtlSeconds` sets the 60 second TTL (0 turns it off), and the entries and invalidation are described in the note above and in the work item. Measured on the seeded catalog with the in-process provider: browse about 20 ms to about 3 ms at p50 (`docs/evidence/WI-CAT-003/after-2026-11-07.md`). Added the same day: stampede protection, so concurrent misses for one key share a single load (per process), and a generation guard so a load that began before a write cannot fill the cache after it.
