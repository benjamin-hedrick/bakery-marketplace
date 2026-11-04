> **Status:** In review · built and run locally on `feature/slice-personalization` (2026-11-04); waiting for the lead's review of the rule, its wording and the two defaults below (this is the safety rule)

> **Outcome note (2026-11-04):** built in three steps. (1) The rule, `ConflictMatcher` (pure; exact id match; `allergy` before `avoid`, then allergen id, then the item before its options; an allergen in both lists counts as the serious one; a stored flag that is not an allergen id never matches and is never guessed at). (2) The catalog endpoints, all Customer role, all `private, no-store`: `GET /catalog/listings/for-me` (same listings, order and cursor as the public list, each wrapped as `{ listing, conflicts }`; `hideConflicts` filters **before** paging through a new optional filter on `ListingService.BrowseAsync`), `GET /catalog/listings/for-me/{id}`, and `POST /catalog/preferences/check` (at most 50 lines of 20 options, 64 KB body, read with a limit; a listing that is not public is `found: false`, unknown option ids are named and count for nothing). (3) The BFF: `personalizedListings`, `personalizedListing` and `cartCheck`, mapping only (a cart over the limits is BAD_INPUT before anything is sent; a listing id that does not decode is a line that was not found).
>
> **Verified (local):** 10 rule tests and 21 endpoint tests (catalog 227 passed, 7 skipped without the emulator); 16 BFF tests (198 in all); 3 real-stack journeys on the seeded catalog (the almond croissant's item and option conflicts, the walnut muffin conflicting only through an add-on, the sourdough's sesame only when the seeds are chosen; hiding keeps the muffin and removes the croissant and the dairy items; a vendor token FORBIDDEN, no token UNAUTHENTICATED, the public list still anonymous), `skeleton-smoke.mjs --containers` 37 passed. Mutation checks, each failing the intended test only: the cart counting every option; hiding on option-only conflicts; hiding after paging; any role allowed; `avoid` outranking `allergy`.
>
> **Changes from the original plan:** the answer is wrapped (`{ listing, conflicts }`) so the public listing shape is reused as it is; the cart check always asks the catalog, even for an empty cart, because the catalog is what checks the caller's role (found by the real-stack journey: an empty cart had been answered without asking, so a vendor token got an empty list instead of FORBIDDEN); the framework logs the request URL, so `hideConflicts=true` can appear in a log line (a view setting, not an allergen); the privacy tests therefore look for allergen ids and the word `allergy`.
>
> **Not done / limits:** a listing stored before the allergen list was closed can hold a value that is not an id, and it can never match (it is shown by the public view and never flagged here); the cart check probes each verified vendor's partition for a listing, as the public detail does (known limitation of id-only addressing); no web screen yet (`CUST-006`, `CUST-008`); another customer's conflicts were not tried on the real stack (one mock customer; the catalog tests cover it).

```
WI ID:               SRCH-001
Title:                Matching listings against the customer's allergen profile (browse, detail, cart check)
Type:                 Service Implementation
Epic:                 EPIC-SEARCH
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               In review
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
- [ ] The default for `hideConflicts` (off, as before) and the item-only rule for hiding are decisions made here, for the lead to confirm when it is visible in `CUST-006`. Built as written: both severities hide at the item level; an option-only conflict never hides.
