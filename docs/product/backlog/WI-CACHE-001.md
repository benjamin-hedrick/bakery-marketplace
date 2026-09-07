```
WI ID:               CACHE-001
Title:                Define CacheProvider interface + shared contract test suite
Type:                 Interface/Contract
Epic:                 EPIC-CACHING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
ADR-0002 establishes an environment-conditional caching strategy: a `CacheProvider` interface with `RedisCacheProvider` and `LocalCacheProvider` implementations, so caching can drop to zero cost locally while still supporting managed Redis in staging/prod. This item defines the interface and the contract tests every implementation must pass — it doesn't build either implementation itself (those are separate items so they can be worked independently, possibly in parallel, once this contract is frozen).

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0002-cache-strategy.md` (the full design this implements)
- *Interfaces*: none consumed — this item defines one, not consumes one
- *Environment/tooling*: `docs/architecture/tech-stack.md` local-dev table (Cache row) for how the two implementations are expected to run locally vs. cloud
- *Test/chaos methodology*: `project-process-framework/domains/software-systems/architecture-patterns.md` — the adapter + contract-test + chaos decorator pattern this item is the "adapter interface" half of
- *Business context*: none needed — this is a pure infrastructure/architecture concern with no direct business-rule input

**You do not need to know about**
- The bakery domain itself (Catalog, Ordering, etc.) — this interface is domain-agnostic; you're building a generic cache contract, not anything specific to listings or orders
- Auth, payments, or any other cross-cutting concern beyond what's listed above

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
Yes. This item is fully specified by ADR-0002 plus the acceptance criteria above; no open judgment calls remain that would require direct human input mid-task. The reference list is short and categorized, and fits comfortably in a bounded context window.

**Open Points (working)**
*(none currently)*
