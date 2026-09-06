```
WI ID:               CACHE-001
Title:                Define CacheProvider interface + shared contract test suite
Type:                 Interface/Contract
Epic:                 EPIC-CACHING
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
ADR-0002 establishes an environment-conditional caching strategy: a `CacheProvider` interface with `RedisCacheProvider` and `LocalCacheProvider` implementations, so caching can drop to zero cost locally while still supporting managed Redis in staging/prod. This item defines the interface and the contract tests every implementation must pass — it doesn't build either implementation itself (those are separate items so they can be worked independently, possibly in parallel, once this contract is frozen).

**Inputs / References**
- `docs/architecture/adr/0002-cache-strategy.md` (the full design this implements)
- `docs/architecture/tech-stack.md` (cross-cutting patterns section — confirms this follows the same adapter+contract-test approach used for events/data access)

**Out of scope**
- Does not implement `RedisCacheProvider` or `LocalCacheProvider` (separate items: WI-CACHE-002, WI-CACHE-003)
- Does not implement the `ResilientCacheProvider` fallback decorator or `ChaosCacheProvider` (WI-CACHE-003, WI-CACHE-004)
- Does not touch Terraform or Compose config (WI-CACHE-005)

**Requirements / Acceptance Criteria**
- `CacheProvider` interface defines `get(key)`, `set(key, value, ttl)`, `delete(key)`, `exists(key)`
- A shared contract test suite exists (runnable against any implementation) covering at minimum:
  - set then get returns the value
  - get on a missing key returns a clear "miss" result, not an exception
  - delete removes a key such that a subsequent get is a miss
  - a key set with a TTL is a miss after the TTL elapses
- Contract test suite is written to be run against a test double with zero modification — i.e., adding a new implementation later should mean "point the suite at it," not "rewrite the suite"

**Dependencies**
- Blocks: WI-CACHE-002, WI-CACHE-003, WI-CACHE-004 (none of those can be usefully started without this interface being frozen)
- Blocked by: none
- Can be worked in parallel with: WI-CACHE-005 (infra work doesn't depend on the interface shape)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the contract test suite itself must be reviewed and merged before any dependent item (WI-CACHE-002/003/004) is marked Ready — it's the shared foundation those items build on.

**AI-agent suitability**
Yes. This item is fully specified by ADR-0002 plus the acceptance criteria above; no open judgment calls remain that would require direct human input mid-task. The capped reference list (2 documents) fits comfortably in a bounded context window.
