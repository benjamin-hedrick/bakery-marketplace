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
  - WI-CACHE-001 (Interface/Contract — CacheProvider interface + contract test suite)
  - WI-CACHE-002 (Service Implementation — RedisCacheProvider) — not yet written
  - WI-CACHE-003 (Service Implementation — LocalCacheProvider + ResilientCacheProvider decorator) — not yet written
  - WI-CACHE-004 (Test/Mock/Chaos — ChaosCacheProvider + fallback proof tests) — not yet written
  - WI-CACHE-005 (Infra/Environment — Terraform enable_managed_redis toggle + Compose with-redis profile) — not yet written
Status:              Not Started (one constituent item drafted as a template validation example)
```
