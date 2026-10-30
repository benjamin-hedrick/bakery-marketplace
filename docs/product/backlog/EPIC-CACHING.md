> **Status:** 4 of 4 items with a spec done (CACHE-005 is held and has no spec)

```
Epic ID:            EPIC-CACHING
Title:               Caching layer (environment-conditional, with local fallback)
Scope:               Catalog, Search & Discovery (the two consumers of cached data per ADR-0002)
Primary hat(s):      Platform Engineering, Architect
Goal:                Deliver the CacheProvider abstraction and both implementations so catalog/search reads
                     can be cached in any environment, with graceful fallback to local caching if managed
                     Redis is unreachable.
Related references:  ADR-0002 (docs/architecture/adr/0002-cache-strategy.md)
Constituent work items:
  - WI-CACHE-001 (Interface/Contract — CacheProvider interface + contract test suite) — Done, agent-delivered, spec-reviewed
  - WI-CACHE-002 (Service Implementation — RedisCacheProvider) — Done (2026-09-15)
    (vendor question only affects CACHE-005's cloud provisioning, not this item — see open item #22)
  - WI-CACHE-003 (Service Implementation — LocalCacheProvider + ResilientCacheProvider decorator) — Done, agent-delivered, spec-reviewed
  - WI-CACHE-004 (Test/Mock/Chaos — ChaosCacheProvider + fallback proof tests) — Done, agent-delivered, spec-reviewed
  - WI-CACHE-005 (Infra/Environment — Terraform enable_managed_redis toggle + Compose with-redis profile) — 🛑 HOLD, vendor under reconsideration (open item #22); cloud caching backend choice explicitly deferred per 2026-09-12 planning session
Status:              4 of 4 items with a spec done (CACHE-005 is held and has no spec)
```

> **Reconciliation note (2026-10-26).** ADR-0014 names this epic's cache as **layer 1 (server/data-source)** of three. Every item here is retained unchanged. The Relay client store and HTTP/CDN layers are governed by ADR-0014 and documented for the listing path by `WI-PORT-004`, which also records `WI-CAT-003`'s use of this cache in the per-cache contract format. See `docs/product/backlog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.
