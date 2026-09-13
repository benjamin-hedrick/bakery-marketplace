```
WI ID:               DEV-003
Title:                Seed / fixture data script
Type:                 Infra/Environment
Epic:                 EPIC-LOCAL-DEV
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
`DEV-001` gets the environment running but empty. A demoable local e2e needs seeded reference data — vendors, listings with modifiers/allergy flags, preference profiles.

**Inputs / References**
- *Decisions*: none new
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`) — seeds through the repository abstraction, not raw SDK calls
- *Environment/tooling*: `DEV-001`
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
- Blocked by: `DEV-001`, `DATA-002`
- Can be worked in parallel with: `DEV-002`

**AI-agent suitability**
Yes — fully derivable from existing schema docs.

**Environment(s) affected**: local dev only
**Resources provisioned/changed**: seed script + fixture data
**Secrets/config touched**: none

**Open Points (working)**
*(none currently)*
