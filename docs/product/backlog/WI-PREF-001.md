```
WI ID:               PREF-001
Title:                Preference Profile CRUD
Type:                 Service Implementation
Epic:                 EPIC-PREFERENCES
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

**Context / Why**
The Preferences & Dietary Safety bounded context exists in the glossary and vision (principle 1: dietary safety is first-class) and has a documented container shape (`data-model-api-contracts.md`'s `preferences` container), but no work item has ever implemented it. This item is the CRUD half; `PREF-002` (the Open Host Service publication to Search/Ordering) depends on this existing first.

**Inputs / References**
- *Decisions*: ADR-0004 (`preferences` container, `customerId` partition key, Session consistency), ADR-0009 (hosted in `catalog-service`), ADR-0006 (Customer role + resource-ownership check)
- *Interfaces*: `IRepository<T>`/`CosmosRepository<T>` (`DATA-002`), `AUTH-002`'s ownership-check pattern
- *Environment/tooling*: local Cosmos emulator, `WI-DEV-001` (needs a real `CatalogService` project to add code to — Preferences is hosted there per ADR-0009, alongside Catalog/Search/Advertising)
- *Test/chaos methodology*: standard unit + integration tests, no adapter/chaos pattern (domain logic, not a swappable backend)
- *Business context*: `docs/architecture/ddd/glossary.md` (Preference Profile), vision principle 1 (dietary safety first-class — allergy/preference data must be easy to find and edit, not buried)

**You do not need to know about**
- How the snapshot actually gets published to Search/Ordering (`PREF-002`, separate item) — this item only owns the profile itself
- Any other bounded context's data — Preferences reads/writes only its own `preferences` container

**Out of scope**
- Does not publish a Preference Snapshot anywhere (`PREF-002`)
- Does not implement dietary-preference filtering at query time in Search (`SRCH-001`) — this item is CRUD only, not a consumer

**Requirements / Acceptance Criteria**
- `PreferenceProfile` document per `data-model-api-contracts.md`: `id, customerId, allergies[], dietaryPreferences[], updatedAt`
- Endpoints per `data-model-api-contracts.md`: `GET /catalog/preferences/{customerId}` (Customer role + resource-ownership check via `AUTH-002`'s pattern), `PUT /catalog/preferences/{customerId}` (same role/ownership requirement)
- A customer with no existing profile gets a sensible empty-profile response on `GET` (empty `allergies`/`dietaryPreferences` arrays), not a 404 — a profile is implicitly created on first `PUT`, not requiring a separate `POST`
- `allergies`/`dietaryPreferences` are free-form string arrays for v1 (no controlled vocabulary/taxonomy) — matches how `data-model-api-contracts.md` already specifies the shape; a controlled taxonomy is a plausible v2 enhancement, not decided here

**Dependencies**
- Blocks: `PREF-002`, `SRCH-001` (needs a real Preference Profile to filter against)
- Blocked by: `DATA-002`, `AUTH-002`, `DEV-001` (base .NET solution scaffold)
- Can be worked in parallel with: `VEN-001` (no shared code or data)

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing container shape and API contract; no open judgment calls.

**Interfaces consumed**: `IRepository<T>` (`DATA-002`)
**Events published/consumed**: none (this item raises no events — `PREF-002` is the publishing step)
**Data touched**: `preferences` container

**Open Points (working)**
*(none currently)*
