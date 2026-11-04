> **Status:** Ready

```
WI ID:               SRCH-001
Title:                Matching listings against the customer's allergen profile (browse, detail, cart check)
Type:                 Service Implementation
Epic:                 EPIC-SEARCH
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 M
```

> **Rewritten 2026-11-04** (ADR-0022, the lead's decisions of the same day). Git keeps the original. What changed: the public `GET /catalog/listings` is **not** given a `personalize` parameter; matching is a separate customer-only set of endpoints (the public ones stay anonymous and cacheable, ADR-0014); matching is on allergen **ids** (the closed list), so no normalization; there is no snapshot event (`PREF-002` is superseded); and the same rule also checks a **cart** (only the options actually chosen count), which the browse view cannot do.

**Context / Why**
Vision principle 1 says dietary safety is surfaced at browse, customization and cart. The rule that decides whether something conflicts is domain logic, so it lives in the catalog and the BFF only maps it. One rule, three read shapes: the browse list, a listing, and a cart.

**Inputs / References**
- *Decisions*: ADR-0022 (kinds, ids; absence of a flag means unknown, never safe), ADR-0009 and ADR-0013 (the rule is in the service), ADR-0014 (`private, no-store`), NFR 3.7, `docs/product/personas.md` (Dana).
- *Interfaces*: `PREF-001`'s profile read through an interface inside the catalog, the listing services, `TAG-001`'s registry.

**You do not need to know about**
- How the profile is edited (`CUST-005`) or how a conflict is drawn (`CUST-006`, `CUST-008`).

**Out of scope**
- Diet preferences ("prefer": `TAG-004`); ranking; sponsored placement; any change to the public endpoints.

**Requirements / Acceptance Criteria**
- **The rule.** A **conflict** is an allergen id in the customer's `allergies` (severity `allergy`) or `avoid` (severity `avoid`) that appears in the listing's `allergenFlags` (source: the item) or in the `allergens` of an option (source: that option). Exact id match; a listing with no conflicts has none and says nothing more (it is never labelled safe or "matching").
- **Browse:** `GET /catalog/listings/for-me?limit=&after=&hideConflicts=` (Customer role) returns the same page as the public list, in the same order, each listing with `conflicts: [{ allergenId, severity, source: "item" | "option", optionIds }]`. `hideConflicts=true` leaves out listings whose **item** conflicts; a listing that conflicts only through an optional add-on is kept and marked (hiding a whole product for an optional extra would remove too much).
- **Detail:** `GET /catalog/listings/for-me/{id}` returns the listing with its conflicts, item and every option.
- **Cart check:** `POST /catalog/preferences/check` with `{ lines: [{ listingId, optionIds }] }` (at most 50 lines) returns, per line, the conflicts of the item and of **the chosen options only**. An unknown listing or option id in a line is reported for that line, not as a failure of the whole check.
- A customer without a profile gets empty `conflicts` everywhere, never an error. All responses are `private, no-store`; the profile never appears in a log or a span (as `PREF-001`).
- **BFF:** `personalizedListings(first, after, hideConflicts)`, `personalizedListing(id)` and `cartCheck(lines)`, each mapped as sent with the caller's token forwarded; 401 UNAUTHENTICATED, 403 FORBIDDEN. The schema file is the contract.
- **Abuse cases:** a vendor token is refused; no token is 401; a customer cannot ask about another customer (there is no parameter); an over-long line list is 422; the public endpoints are unchanged (anonymous, same cache headers, no conflicts field).
- **Tests:** a top-level match; a match only through an option; the cart counting only the chosen option (the same listing with and without the option); `allergy` and `avoid` on one allergen id being refused at the profile and both severities reported when different allergens; `hideConflicts` removing only item-level conflicts; paging equal to the public list; an empty profile; the abuse cases; BFF mapping; each rule shown to fail when removed.

**Dependencies**
- Blocks: `CUST-006`, `CUST-008`.
- Blocked by: `PREF-001`, `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes, with the lead's review: this is the safety rule, and its wording and defaults are product decisions that are stated above rather than left to the build.

**Interfaces consumed**: `IPreferenceReader` (in-process, `PREF-001`), `ITagRegistry`
**Events published/consumed**: none
**Data touched**: none new

**Open Points (working)**
- [ ] The default for `hideConflicts` (off, as before) and the item-only rule for hiding are decisions made here, for the lead to confirm when it is visible in `CUST-006`.
