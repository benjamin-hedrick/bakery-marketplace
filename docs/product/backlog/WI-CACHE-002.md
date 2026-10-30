> **Status:** Done · evidence: `tools/BakeryMarketplace.Caching` (Redis provider) and its tests

```
WI ID:               CACHE-002
Title:                RedisCacheProvider implementation
Type:                 Service Implementation
Epic:                 EPIC-CACHING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0002 names `RedisCacheProvider` (via `StackExchange.Redis`, per ADR-0010) as the managed-cache implementation behind `ICacheProvider`. Previously held pending the managed-Redis vendor decision (open item #22). Unblocked as of 2026-09-12: the vendor question only concerns which cloud service backs a Redis-protocol endpoint in staging/prod — this implementation talks to any Redis-compatible endpoint (a local Compose container today), so building it now carries no rework risk regardless of how the cloud vendor question resolves. Only `CACHE-005` (the Terraform cloud toggle) remains genuinely vendor-locked and stays held.

**Inputs / References**
- *Decisions*: ADR-0002 (full design), `docs/governance/open-items-register.md` #22 (why this is safe to build now)
- *Interfaces*: `ICacheProvider` (`CACHE-001`)
- *Environment/tooling*: `docker-compose --profile with-redis` (local Redis container); `CACHE_BACKEND=redis` config switch
- *Test/chaos methodology*: `CacheProviderContractTests` (`CACHE-001`)
- *Business context*: none

**You do not need to know about**
- Which cloud vendor eventually backs managed Redis in staging/prod (open item #22)

**Out of scope**
- Does not build the Terraform `enable_managed_redis` toggle or any cloud-vendor-specific provisioning (`CACHE-005`, still held)
- Does not modify `ResilientCacheProvider` or `ChaosCacheProvider` (already built)

**Requirements / Acceptance Criteria**
- `RedisCacheProvider` implements `ICacheProvider` using `StackExchange.Redis`
- Serialization via `System.Text.Json`, matching `CacheResult<T>`'s Found/Value contract on hit vs. miss
- `SetAsync` applies TTL via Redis's native expiry, not an emulated one
- Passes the full `CacheProviderContractTests` suite against a local Redis container
- Connection config via `CACHE_BACKEND=redis` + a connection-string config value, not hardcoded

**Dependencies**
- Blocked by: `CACHE-001` (done)
- Can be worked in parallel with: `DATA-002`, `EVT-003`, `AUTH-002`, `AUTH-005`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: must pass the contract suite against a real local Redis instance.

**AI-agent suitability**
Yes — fully specified by ADR-0002 plus `CACHE-001`'s contract; the vendor question creates no ambiguity for this item specifically.

**Interfaces consumed**: none new (implements `ICacheProvider`)
**Events published/consumed**: none
**Data touched**: none (cache only)

**Open Points (working)**
*(none currently)*
