> **Status:** Done · evidence: `tools/BakeryMarketplace.Auth/ResourceOwnershipHandler.cs` and its tests

```
WI ID:               AUTH-002
Title:                Per-service resource-ownership check pattern + reference application
Type:                 Service Implementation
Epic:                 EPIC-AUTH
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 M
```

**Context / Why**
`AUTH-001` provides the generic `IResourceOwnershipChecker`; ADR-0006 requires each service actually apply it per resource type (e.g., "is this Listing's `vendorId` the caller's `sub`"). This item is the reusable pattern plus one worked reference example, not a per-service rollout — each domain epic wires it into its own endpoints when built.

**Inputs / References**
- *Decisions*: ADR-0006 (two-layer authorization), `data-model-api-contracts.md` (specific endpoints requiring ownership checks, e.g. `PUT /catalog/listings/{id}`)
- *Interfaces*: `IResourceOwnershipChecker` (`AUTH-001`)
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: deterministic tests only, same reasoning as `AUTH-003`
- *Business context*: `data-model-api-contracts.md`

**You do not need to know about**
- Any service's business logic beyond which field represents ownership
- The identity-provider swap (unaffected, same as `AUTH-001`)

**Out of scope**
- Does not implement every service's endpoints — each domain epic (`CAT-001`, etc.) applies this pattern to its own resources when built

**Requirements / Acceptance Criteria**
- A reusable `IAuthorizationRequirement` + handler that composes a role-policy check (`AUTH-001`) with an `IResourceOwnershipChecker` call against a resource ID from the route
- One worked reference example against `PUT /catalog/listings/{id}` (`Vendor` role + `listing.vendorId == sub`), matching `data-model-api-contracts.md`
- Deterministic tests: authorized owner passes; wrong owner → 403; missing role claim → 403 before the ownership check even runs (role check short-circuits first, per ADR-0006's stated order)

**Dependencies**
- Blocked by: `AUTH-001` (done)
- Can be worked in parallel with: `DATA-002`, `CACHE-002`, `EVT-003`, `AUTH-005`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — the pattern and reference example are fully specified by ADR-0006 plus the existing data contract doc.

**Interfaces consumed**: `IResourceOwnershipChecker` (`AUTH-001`)
**Events published/consumed**: none
**Data touched**: none directly (authorization layer)

**Open Points (working)**
*(none currently)*
