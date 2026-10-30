> **Status:** Done · evidence: `tools/BakeryMarketplace.Caching` and its tests

```
WI ID:               CACHE-001
Title:                Define CacheProvider interface + shared contract test suite
Type:                 Interface/Contract
Epic:                 EPIC-CACHING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0002 establishes an environment-conditional caching strategy: a `CacheProvider` interface with `RedisCacheProvider` and `LocalCacheProvider` implementations, so caching can drop to zero cost locally while still supporting managed Redis in staging/prod. This item defines the interface and the contract tests every implementation must pass — it doesn't build either implementation itself (those are separate items so they can be worked independently, possibly in parallel, once this contract is frozen).

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0002-cache-strategy.md` (the full design this implements)
- *Interfaces*: none consumed — this item defines one, not consumes one
- *Environment/tooling*: `docs/architecture/tech-stack.md` local-dev table (Cache row) for how the two implementations are expected to run locally vs. cloud
- *Test/chaos methodology*: the adapter + contract-test + chaos decorator pattern described under "`tools/` shared libraries" in `CLAUDE.md` — this item is the "adapter interface" half of it
- *Business context*: none needed — this is a pure infrastructure/architecture concern with no direct business-rule input

**You do not need to know about**
- The bakery domain itself (Catalog, Ordering, etc.) — this interface is domain-agnostic; you're building a generic cache contract, not anything specific to listings or orders
- Auth, payments, or any other cross-cutting concern beyond what's listed above

**Out of scope**
- Does not implement `RedisCacheProvider` or `LocalCacheProvider` (separate items: WI-CACHE-002, WI-CACHE-003)
- Does not implement the `ResilientCacheProvider` fallback decorator or `ChaosCacheProvider` (WI-CACHE-003, WI-CACHE-004)
- Does not touch Terraform or Compose config (WI-CACHE-005)

**Requirements / Acceptance Criteria**
- `ICacheProvider` interface (C#, per ADR-0010):
```csharp
public interface ICacheProvider
{
    Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default);
    Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<bool> ExistsAsync(string key, CancellationToken ct = default);
}

public readonly struct CacheResult<T>
{
    public bool Found { get; }
    public T? Value { get; }
    public static CacheResult<T> Miss() => new(false, default);
    public static CacheResult<T> Hit(T value) => new(true, value);
    private CacheResult(bool found, T? value) { Found = found; Value = value; }
}
```
- A shared **xUnit abstract test base class** (`CacheProviderContractTests`), with a `protected abstract ICacheProvider CreateProvider();` factory method, covering at minimum:
  - set then get returns the value
  - get on a missing key returns `CacheResult<T>.Miss()`, not a thrown exception
  - delete removes a key such that a subsequent get is a miss
  - a key set with a TTL is a miss after the TTL elapses
- A new implementation "inherits" the contract suite by subclassing `CacheProviderContractTests` and overriding `CreateProvider()` — adding a new implementation later means writing one subclass, not rewriting the suite

**Dependencies**
- Blocks: WI-CACHE-002 (held, see open item #22), WI-CACHE-003, WI-CACHE-004 (none of those can be usefully started without this interface being frozen)
- Blocked by: none
- Can be worked in parallel with: WI-CACHE-005 (held, see open item #22)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the contract test suite itself must be reviewed and merged before any dependent item (WI-CACHE-002/003/004) is marked Ready — it's the shared foundation those items build on.

**AI-agent suitability**
Yes. This item is fully specified by ADR-0002 plus the acceptance criteria above; no open judgment calls remain that would require direct human input mid-task. The reference list is short and categorized, and fits comfortably in a bounded context window.

**Open Points (working)**
*(none currently)*
