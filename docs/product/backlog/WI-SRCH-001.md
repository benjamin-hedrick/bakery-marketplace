```
WI ID:               SRCH-001
Title:                Search/filter by dietary preference (consumes Preference Snapshot)
Type:                 Service Implementation
Epic:                 EPIC-SEARCH
Shared with epic(s):  EPIC-PREFERENCES (consumes PREF-002's published snapshot)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

**Context / Why**
`PREF-002` publishes a Preference Snapshot (in-process, per ADR-0009's modular monolith rule, since Preferences and Search are both hosted in `catalog-service`) but nothing consumes it — the actual dietary-safety filtering the bounded context map describes has never been implemented. This is vision principle 1's headline promise ("dietary safety is first-class... surfaced at browse... not buried"), and closing it is the reason `LOCAL-MILESTONES.md`'s M4 exists as its own milestone rather than being folded into M3.

**A product decision made explicitly here, not left implicit**: conflicting listings are **flagged, not silently excluded**, by default — matching the vision's "impossible to miss" framing (Dana's persona) more directly than silent removal would, and consistent with `CUST-002`'s existing requirement that allergy flags be visible, not buried in a secondary view. An explicit "hide conflicting items" mode is also supported as an opt-in, so a customer who wants a strictly-filtered view can get one — but flag-first is the default. This is a judgment call, not a business decision resolved elsewhere; flagged as adjustable, not fixed.

**Inputs / References**
- *Decisions*: bounded context map (Preferences → Search Open Host Service relationship), vision principle 1, ADR-0009 (in-process consumption, modular monolith rule)
- *Interfaces*: `PREF-002`'s in-process Preference Snapshot contract, `CAT-001`'s `catalog` container/`Listing` shape
- *Environment/tooling*: not applicable beyond what `CAT-001`/`PREF-001` already require
- *Test/chaos methodology*: standard unit tests — no adapter/chaos pattern, this is domain query logic
- *Business context*: `docs/architecture/ddd/glossary.md` (Preference Snapshot, Allergy Flag), `docs/product/vision.md` principle 1

**You do not need to know about**
- `PREF-002`'s event-publishing mechanics — this item only needs the snapshot's current field values for a given `customerId`, not how it got there
- `SRCH-002`'s sponsored-placement blending or `SRCH-003`'s ranking logic — this item is dietary matching only, independent of either

**Out of scope**
- Does not implement sponsored-placement blending (`SRCH-002`) or ranking beyond the flag/hide behavior described here (`SRCH-003`)
- Does not change `CAT-001`'s `Listing` document shape — matching reads `allergenFlags[]` and each modifier's `allergens[]` as already defined, adds nothing new to the stored document
- Does not build any frontend surface for this — that's `CUST-006`, a separate item

**Requirements / Acceptance Criteria**
- `GET /catalog/listings` (already defined in `data-model-api-contracts.md`) gains two optional query parameters: `personalize=true` (requires an authenticated customer; computes matches against their current Preference Snapshot) and `hideConflicts=true` (only meaningful combined with `personalize`)
- A listing "conflicts" with a customer's profile if any entry in `Listing.allergenFlags[]` or any modifier's `allergens[]` intersects with `PreferenceProfile.allergies[]` — case-insensitive, exact string match for v1 (no synonym/taxonomy matching — e.g., "tree nuts" and "nuts" are treated as distinct strings unless they match exactly; a controlled allergen taxonomy is a plausible future enhancement, not built here)
- Default behavior (`personalize=true`, `hideConflicts` unset or `false`): every listing is returned, each annotated with `matchesPreferences: bool` and `conflictingAllergens: []` so the frontend can flag it prominently
- `hideConflicts=true`: conflicting listings are excluded from the response entirely, rather than merely flagged
- `personalize` with no authenticated customer, or a customer with an empty Preference Profile, returns the unmodified listing set (every listing `matchesPreferences: true`, no conflicts) — never an error
- Unit tests proving: a listing with a top-level allergen match is flagged; a listing whose *only* conflict is on a modifier (not the base item) is still flagged; `hideConflicts=true` actually removes it from the result set; a customer with no preferences set sees no flags at all

**Dependencies**
- Blocks: `CUST-006`
- Blocked by: `PREF-002`, `CAT-001`
- Can be worked in parallel with: `CUST-005`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. The one judgment call (flag-first, hide-as-opt-in) is stated explicitly above as this item's chosen default rather than left open, so an agent has a concrete behavior to build against; revisiting that default later is a product decision, not something this item needs to resolve further.

**Interfaces consumed**: `PREF-002`'s in-process snapshot contract, `IRepository<T>`/`CosmosRepository<T>` (`CAT-001`'s existing usage)
**Events published/consumed**: none directly (consumes the snapshot in-process, not via a new subscription — `PREF-002` already wired the in-process contract)
**Data touched**: none new — reads `catalog` and the in-process preference snapshot only

**Open Points (working)**
- [ ] Flag-first vs. hide-first as the *default* (not the availability of both modes, which is settled above) is a real product/UX call. Proceeding with flag-first as the default per the reasoning in Context/Why; revisit if a reviewer disagrees once it's actually visible in `CUST-006`.
