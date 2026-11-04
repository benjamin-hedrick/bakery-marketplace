> **Status:** In review · built and run locally on `feature/slice-personalization-web` (2026-11-04); real-stack journeys written but not yet run

> **Outcome note (2026-11-04):** built as specified. After login the home and detail pages ask `preferences` first (a small answer); only a non-empty profile leads to `personalizedListings` or `personalizedListing` (network-only, with the registry labels from `tags`). A logged-out customer, an empty profile and a failed request all leave today's page, and the browser makes no personalized request that it does not need. An allergy is marked "Allergy warning: Contains tree nuts, which you listed as an allergy" (bold, a left border and a warning icon), an avoid "You avoid this: Contains milk (dairy), which you avoid"; a conflict through an option names the option and also shows on that option's row on the detail page. The marks sit inside the listing link, so they are part of its accessible name. The hide switch (off by default) removes items whose **item** conflicts, instantly and with no new request, and says how many are hidden. The wording rules are in `src/lib/conflictText.ts` with unit tests (no "safe", "free", "match"; an unknown severity is shown as an allergy, never dropped).
>
> **Verified (local):** 10 unit tests of the wording; 10 browser tests against the mock BFF (each severity, an option-only conflict, the toggle and its count, logged-out and empty-profile pages with zero personalized requests, the server HTML unchanged, a failing request, axe smoke); the whole mock suite passed (94). A mutation check (any conflict hides an item) failed the toggle test and the unit test.
>
> **Not run:** the real-stack journeys in `tests/skeleton/profile-page.spec.ts` (the almond croissant against a tree-nut allergy, the sourdough's sesame option, a vendor login); the run was stopped for low memory. Finish them with the next `skeleton-smoke.mjs --containers` run.
>
> **Changes from the original plan:** the profile is probed first (an extra small request) so a customer without a profile triggers no personalized request; the real catalog reports an option conflict separately even when the item carries the same allergen, so a croissant shows both marks. **Not done:** the list is not refreshed after the Refresh button (marks stay as first loaded); no marks in the cart (`CUST-008`).

```
WI ID:               CUST-006
Title:                Allergen conflicts on browse and detail
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-SEARCH
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 S
```

> **Rewritten 2026-11-04.** Git keeps the original. What changed: conflicts come from `SRCH-001`'s customer-only endpoints through the BFF and are laid over the public, anonymous page after login (the server render and its cache are unchanged, ADR-0014); there are two severities (`allergy`, `avoid`); the wording never says an item is safe or "matches".

**Context / Why**
`CUST-002` shows an item's generic allergen flags to everyone. The promise of vision principle 1 (Dana: "impossible to miss") is not real until a customer's **own** conflicts are visibly different from the generic flags.

**Inputs / References**
- *Decisions*: ADR-0022 (the wording rules), ADR-0014, ADR-0012, NFR 3.7, `docs/product/personas.md`.
- *Interfaces*: the BFF `personalizedListings` and `personalizedListing` (`SRCH-001`), the home page and detail page components.

**You do not need to know about**
- The matching rule's internals (`SRCH-001`); how the profile is set (`CUST-005`).

**Out of scope**
- The cart and checkout (`CUST-008`); diet preferences (`TAG-004`); changing anything for a logged-out customer or one without a profile.

**Requirements / Acceptance Criteria**
- The server-rendered public page is unchanged. After login, when the customer's profile is non-empty, the page asks for the personalized list (network-only, private) and lays the conflicts over the listings by id. A logged-out customer, or one without a profile, sees today's page and the browser makes no personalized request that it does not need.
- A listing with an `allergy` conflict is marked unmistakably and names the allergens inline ("Contains tree nuts, which you listed as an allergy"); an `avoid` conflict is marked more quietly ("Contains dairy, which you avoid"). A conflict that comes only through an option says which option ("Add walnuts contains tree nuts"). Marks use text and an icon, never colour alone, and are part of the item's accessible name.
- A toggle, off by default, hides listings whose **item** conflicts (as `SRCH-001`); switching it is instant, without a reload, and says how many are hidden. The detail page shows the item's and every option's conflicts.
- The wording never says an item is safe, free of an allergen, or "matches". A listing without a conflict looks as it does today, plus the page-level reminder that unmarked is not guaranteed.
- **Tests:** against the mock BFF (each severity, an option-only conflict, the toggle, a logged-out customer and an empty profile seeing no change, the server HTML unchanged) and on the real stack (the seed's almond croissant against a tree-nut allergy, the sourdough's sesame option); accessibility smoke of the marked list.

**Dependencies**
- Blocks: none.
- Blocked by: `SRCH-001`; `CUST-005` is soft (the seed can supply a profile for the demo).

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Open Points (working)**
*(none currently)*
