> **Status:** Done · evidence: `tools/BakeryMarketplace.Caching` (chaos provider) and its tests

```
WI ID:               CACHE-004
Title:                ChaosCacheProvider decorator + fallback proof tests
Type:                 Test/Mock/Chaos
Epic:                 EPIC-CACHING
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

**Context / Why**
ADR-0002 requires a `ChaosCacheProvider` decorator that injects latency/errors/outage windows to prove `ResilientCacheProvider`'s circuit breaker actually works — this is what turns "we designed a fallback" into "we proved the fallback works." Entirely vendor-agnostic, same as `CACHE-003` — safe to build now regardless of open item #22.

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0002-cache-strategy.md` (chaos requirements, gating rule), ADR-0010 (C#/.NET, xUnit)
- *Interfaces*: `ICacheProvider` (`CACHE-001`), `ResilientCacheProvider` (`CACHE-003` — must exist first)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: this item *is* the chaos-testing methodology for caching
- *Business context*: none needed

**You do not need to know about**
- Which managed cache vendor is eventually chosen — this decorator wraps any `ICacheProvider`, vendor-agnostic

**Out of scope**
- Does not modify `ResilientCacheProvider` itself (`CACHE-003`) — this item tests it, doesn't change it
- Does not implement real Redis-outage simulation against an actual cloud instance — that's a later, environment-dependent concern; this item's chaos is simulated in-process

**Requirements / Acceptance Criteria**
- `ChaosCacheProvider` decorator:
```csharp
public class ChaosCacheProvider : ICacheProvider
{
    private readonly ICacheProvider _inner;
    private readonly ChaosOptions _options;

    // Wraps any ICacheProvider. Based on ChaosOptions, injects:
    //   - artificial latency
    //   - forced exceptions (simulating connection failure)
    //   - a sustained "outage window" (all calls fail for N seconds)
}

public class ChaosOptions
{
    public double FailureRate { get; set; }        // 0.0–1.0, random failure injection
    public TimeSpan? InjectedLatency { get; set; }
    public TimeSpan? OutageWindow { get; set; }
}
```
- **Gating requirement, not optional**: chaos mode must fail config validation at startup if `ASPNETCORE_ENVIRONMENT == "Production"` and chaos is enabled — structurally impossible to enable in production, not just off by default. This is a hard requirement from ADR-0002, not a nice-to-have.
- xUnit tests using `ChaosCacheProvider` as the primary inside a `ResilientCacheProvider`, proving: an injected outage window causes calls to fall through to `LocalCacheProvider`; a metric/log event fires on fallback; the breaker closes again once the injected outage window ends

**Dependencies**
- Blocks: none
- Blocked by: `CACHE-003` (needs `ResilientCacheProvider` to exist)
- Can be worked in parallel with: `EVT-001`, `DATA-001`, `AUTH-001`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the production-gating check must have its own test proving startup fails fast, not just a code comment claiming it's gated.

**AI-agent suitability**
Yes. Fully specified by ADR-0002 plus the C# above; no open judgment calls.

**Open Points (working)**
*(none currently)*
