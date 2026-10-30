> **Status:** Ready

# WI-PORT-004 --- Cache contract for listing path

```
WI ID:               PORT-004
Title:                Cache contract for the listing path (all three layers)
Type:                 Interface/Contract
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-CACHING
Hat/Owner:            Architect / Engineering/Build (one owner)
Status:               Ready
Size:                 TBD
```

**Decisions**: ADR-0014 (three layers), ADR-0002 (layer 1, unchanged).

**Prerequisites:** ADR-0014 adopted (done 2026-10-26); listing contract
and freshness/invalidation triggers identified (WI-PORT-007). One owner.

Identify which of the three layers are active on the listing path. Layer
1 (server) is ADR-0002's existing cache-aside on listing reads, delivered
by `WI-CAT-003`; document it in the per-cache fields below rather than
redesigning it. Set HTTP policy deliberately; define Relay
update/refetch behavior; add no new BFF-level cache; add stale-state and
authorization-isolation tests.

Acceptance: each active cache has owner, scope/key, freshness,
invalidation, failure behavior, privacy classification, and test.
Personalized data is not publicly cached. Any proposed cache technology
names its use case and measurement plan.
