> **Status:** Ready

```
WI ID:               CUST-006
Title:                Personalized dietary-safety highlighting on browse
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-SEARCH (consumes SRCH-001's personalized query)
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED.** Requirements are retained. **Implementation changes**: built on `CUST-002`'s Next.js/Relay browse view. Personalized results come through the GraphQL BFF using the caller's token, so personalized responses are `private, no-store` and must not reuse the public SSR listing cache (ADR-0014). See `reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
`CUST-002` already shows generic allergen flags/modifiers on every listing, but nothing personalizes that to the logged-in customer's own preferences — the actual "impossible to miss" promise from vision principle 1 (Dana's persona in `docs/product/personas.md`) isn't real until a customer's *own* conflicts are visibly distinguished from everyone else's generic flags. `SRCH-001` computes this; this item is where it actually becomes visible.

**Inputs / References**
- *Decisions*: vision principle 1, `docs/product/personas.md` (Dana's JTBD: "allergy information... impossible to miss... without a phone call to double-check")
- *Interfaces*: `SRCH-001`'s `personalize`/`hideConflicts` query parameters, `CUST-002`'s existing browse view (this item extends it, doesn't replace it)
- *Environment/tooling*: not applicable beyond `WEB-001`/`CUST-002`
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (Allergy Flag, Preference Snapshot)

**You do not need to know about**
- `SRCH-001`'s matching logic internals (case-insensitivity, modifier-level matching) — this item only needs to render whatever `matchesPreferences`/`conflictingAllergens` the API returns

**Out of scope**
- Does not modify `CUST-002`'s core browse/detail behavior for a logged-out or preferences-less customer — falls back to `CUST-002`'s existing generic (non-personalized) display exactly as already built
- Does not implement `CUST-005` itself — this item assumes a preference profile already exists (via `CUST-005` or seed data), it doesn't create one

**Requirements / Acceptance Criteria**
- The browse view calls `GET /catalog/listings` with `personalize=true` whenever the viewer is an authenticated customer with a non-empty preference profile
- A listing where `matchesPreferences: false` is visibly, unmistakably marked as conflicting (not a subtle icon easy to miss — matches `CUST-002`'s own existing "not a secondary tab or collapsed section" bar), naming the specific `conflictingAllergens` inline
- A toggle (default off) lets the customer switch to `hideConflicts=true` for a strictly-filtered view; toggling is instant, no page reload
- A logged-out customer, or one with an empty preference profile, sees `CUST-002`'s existing generic (non-personalized) view unchanged — this item is additive, not a behavior change for that case

**Dependencies**
- Blocks: none
- Blocked by: `SRCH-001`, `CUST-002` (already built/detailed)
- Can be worked in parallel with: `CUST-005` (soft — more useful once real preference data exists via `CUST-005`, but not a hard blocker; seed data alone is enough to demo this item)

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified by `SRCH-001`'s API contract and `CUST-002`'s existing display conventions; no open judgment calls beyond what `SRCH-001` already resolved.

**Open Points (working)**
*(none currently)*
