```
WI ID:               CACHE-003
Title:                LocalCacheProvider + ResilientCacheProvider decorator
Type:                 Service Implementation
Epic:                 EPIC-CACHING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 M
```

**Context / Why**
ADR-0002 establishes `LocalCacheProvider` (in-process, zero external dependency) and a `ResilientCacheProvider` decorator that falls back to it on primary-cache failure, regardless of configured backend. Per ADR-0002's amendment note, this item is **entirely vendor-agnostic** — it works identically no matter which managed cache vendor is eventually chosen (open item #22), since it never talks to Redis or any other cloud cache directly. Safe to build now.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0002-cache-strategy.md` (the full design, including its amendment note), ADR-0010 (C#/.NET, `IMemoryCache`)
- *Interfaces*: `ICacheProvider` (from `CACHE-001` — must exist first)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: `CacheProviderContractTests` (from `CACHE-001`) — this item's `LocalCacheProvider` must pass that same suite
- *Business context*: none needed

**You do not need to know about**
- Which managed cache vendor will eventually back `RedisCacheProvider` (or its replacement) — that's `CACHE-002`, explicitly held (open item #22)
- Any domain-specific caching policy (what gets cached, TTL per data type) — that's decided per-consumer (catalog-service, etc.), not here

**Out of scope**
- Does not implement `RedisCacheProvider` or any other vendor-specific cloud cache implementation (`CACHE-002`, held per open item #22)
- Does not touch Terraform/Compose config (`CACHE-005`, held per open item #22)

**Requirements / Acceptance Criteria**
- `LocalCacheProvider` implements `ICacheProvider` using `IMemoryCache`, passes `CacheProviderContractTests`
- `ResilientCacheProvider` implements `ICacheProvider`, wraps a configured "primary" `ICacheProvider` (which will eventually be `RedisCacheProvider` or its replacement — this item doesn't care which) and a `LocalCacheProvider` fallback:
```csharp
public class ResilientCacheProvider : ICacheProvider
{
    private readonly ICacheProvider _primary;
    private readonly ICacheProvider _fallback;
    private readonly ICircuitBreakerPolicy _breaker;

    // On primary failure/timeout: trip breaker, route to _fallback,
    // emit a log/metric event, periodically probe primary to close the breaker.
    // Constructor takes both providers + breaker policy as dependencies — this
    // item does not decide what the "primary" concretely is.
}
```
- A minimal circuit-breaker abstraction (`ICircuitBreakerPolicy` — trip/probe/reset semantics) — a full-featured library (e.g., Polly) may be used, or a small custom implementation; either is acceptable as long as the fallback behavior is provably correct via tests
- Unit tests proving: primary success → passthrough; primary failure → falls through to local; breaker recovers (half-open → closed) after a successful probe

**Dependencies**
- Blocks: `CACHE-004` (chaos tests need this decorator to exist)
- Blocked by: `CACHE-001` (needs `ICacheProvider` frozen first)
- Can be worked in parallel with: `EVT-001`, `DATA-001`, `AUTH-001`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by ADR-0002 plus the C# above; the pending Redis vendor decision (open item #22) does not create any ambiguity for this item specifically, since it's vendor-agnostic by design.

**Open Points (working)**
*(none currently)*
