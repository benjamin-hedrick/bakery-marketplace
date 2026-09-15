```
WI ID:               DEV-004
Title:                Seed / fixture data script
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Renumbering note (2026-09-13)**: this item was `DEV-003` prior to 2026-09-13, shifted to `DEV-004` in the same renumbering that introduced `WI-DEV-001` (base .NET solution/project scaffold) and moved the real `docker-compose.yml` item from `DEV-001` to `DEV-002`. No content changed beyond the ID itself and the cross-references below.

**Context / Why**
`DEV-002` gets the environment running but empty. A demoable local e2e needs seeded reference data — vendors, listings with modifiers/allergy flags, preference profiles.

**Inputs / References**
- *Decisions*: none new
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`) — seeds through the repository abstraction, not raw SDK calls
- *Environment/tooling*: `DEV-002`
- *Test/chaos methodology*: not applicable
- *Business context*: `data-model-api-contracts.md`, `glossary.md`

**You do not need to know about**
- Any service's business logic beyond the documented shapes

**Out of scope**
- Does not seed order/cart data as if orders were placed — better exercised live once ordering-service exists

**Requirements / Acceptance Criteria**
- Script (auto-run on `docker-compose up`, or documented manual command) writes: 2 vendors (one Shop, one Independent, both `Verified`), 5–10 listings across them with modifiers and at least one allergy flag each, 1–2 sample preference profiles
- Publishes a `VendorVerified` event onto the event backbone for each seeded vendor — the interim local-dev substitute for admin-service's real verification flow (not yet built), per the Open Point recorded in `WI-CAT-001.md`
- Idempotent — running it twice doesn't duplicate data
- Every field traces to a glossary term — no invented fields

**Dependencies**
- Blocked by: `DEV-002`, `DATA-002`
- Can be worked in parallel with: `DEV-003`

**AI-agent suitability**
Yes — fully derivable from existing schema docs.

**Environment(s) affected**: local dev only
**Resources provisioned/changed**: seed script + fixture data
**Secrets/config touched**: none

**Open Points (working)**
*(none currently)*
