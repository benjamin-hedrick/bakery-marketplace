> **Status:** Ready

```
WI ID:               CUST-005
Title:                Preferences / dietary profile UI
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-PREFERENCES (backend logic and data live in PREF-001)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements are retained. **Implementation changes**: a client-rendered Next.js page (authenticated); preference reads and writes go through the GraphQL BFF (ADR-0012/0013). Dietary data is quasi-health data: never logged or traced (ADR-0016), never shared-cached (ADR-0014). **Dependencies change**: blocked by `WI-PORT-002` instead of `WI-WEB-001`. See `reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
`PREF-001` gives every customer a real `PreferenceProfile`, but nothing in `EPIC-WEB-CUSTOMER` lets a customer actually view or edit it through the browser — the only way to set preferences today is a direct API call. This is the gap `docs/product/demo-milestones.md`'s M4 names explicitly: the backend data existing isn't the same as a real customer being able to use it.

**Inputs / References**
- *Decisions*: `docs/architecture/data-model-api-contracts.md` (`GET`/`PUT /catalog/preferences/{customerId}`), vision principle 1 (dietary safety surfaced prominently, not buried)
- *Interfaces*: `WI-WEB-001`'s scaffold/auth wrapper, `PREF-001`'s endpoints
- *Environment/tooling*: not applicable beyond `WEB-001`
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (Preference Profile)

**You do not need to know about**
- How the snapshot gets published or consumed elsewhere (`PREF-002`, `SRCH-001`) — this item only reads/writes the profile itself, same boundary `PREF-001` already draws

**Out of scope**
- Does not implement any dietary-filtering behavior on the browse view — that's `CUST-006`, a separate item consuming `SRCH-001`
- Does not implement a controlled allergen taxonomy/autocomplete — free-text entry for v1, matching `PREF-001`'s own free-form string-array shape

**Requirements / Acceptance Criteria**
- A dedicated, easy-to-find page (not buried in a settings submenu) for viewing/editing the current customer's `allergies[]` and `dietaryPreferences[]`, against `GET`/`PUT /catalog/preferences/{customerId}`
- Free-text entry for both fields (tag-style add/remove, not a single text blob) — matches `PREF-001`'s array shape directly, no client-side reformatting
- A customer with no existing profile sees an empty, immediately-editable form, not an error state (consistent with `PREF-001`'s own "implicitly created on first `PUT`" behavior)
- Saved changes are confirmed visibly (a success indicator), and a failed save is distinguishable from a successful one — no silent failures

**Dependencies**
- Blocks: none directly, though it's what makes `CUST-006`'s personalization actually demonstrable end-to-end with real, browser-entered data rather than only seed data
- Blocked by: `WI-WEB-001`, `PREF-001`
- Can be worked in parallel with: `SRCH-001`, `CUST-006` (the UI itself doesn't depend on either — a customer can set preferences via this page before `SRCH-001`/`CUST-006` exist to consume them)

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by the existing API contract; no business judgment call remains.

**Open Points (working)**
*(none currently)*
