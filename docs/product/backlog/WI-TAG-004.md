> **Status:** In review · decided by the lead and built on `feature/slice-personalization-web` (2026-11-04); the real-stack journey is written but not yet run (register 140)

> **Decisions (the lead, 2026-11-04):** (1) **An option must carry the tag**: an item is marked for a diet only if the item and every chosen option carry it; a forgotten tag means "not marked", never a false claim (recorded as an amendment to ADR-0022). (2) "Prefer" is built now, not after the first demo.
>
> **Outcome note (2026-11-04):** built in three steps. (1) The catalog: the profile (`preferences` container) gains `prefer`, diet tag ids checked against the diets the registry shows today (an allergen, a hidden or unknown id, a repeat is a 422 naming `prefer`); a save without `prefer` leaves the stored list as it was, so a client that does not know about diets cannot clear it. `DietMatcher` applies the rule and returns, per preferred diet, `marked`, `itemMarked` and the options not marked (all of them for browse and detail, only the chosen ones for a cart); a preferred diet that has since been retired or left its window is simply not reported. The personalized list and detail and the cart check carry `dietMatches`; the public responses carry nothing personal. (2) The BFF: `Preferences.prefer`, `SavePreferencesInput.prefer` (optional), `PersonalizedListing.dietMatches`, `CartLineCheck.dietMatches`, passed through and never logged. (3) The customer app: the profile page lists the registry's diets as checkboxes with the wording "Diets are the bakery's own claims"; each listing a logged-in customer sees carries a quiet line, "Vegan, marked by the bakery." or "Not marked vegan by the bakery."; the detail page also names an option that would remove a claim ("Sliced is not marked vegan, so adding it removes the bakery's vegan claim"); the cart names each line, with its chosen options, that is not marked; a switch, off by default, shows only items the bakery has marked for all the customer's diets. Nothing blocks, nothing hides by itself, the diet notes have no icon, bold or border (nothing like an allergen mark), and the preferred diets are never sent to the bakery with an order. The seed's sourdough is vegan, its seed crust is tagged vegan and "Sliced" deliberately is not.
>
> **Verified (local):** 24 catalog tests (the rule in each direction, the platform's tags, a retired or windowed or non-diet id not reported, the profile saved, replaced, cleared and kept when a save leaves it out, each refusal, another customer's profile, the vendor refused, the list and detail, the cart with the options chosen); catalog 291 passed, 7 skipped without the emulator; 9 BFF tests (221 in all); 8 unit tests of the wording and 10 browser tests in the customer app (66 unit and 132 browser tests in all, passing). A mutation check (the chosen-option rule removed) failed 3 catalog tests. **Not run:** the real-stack journey `tests/skeleton/diet-preferences.spec.ts` (see register 140).
>
> **Changes from the original plan:** the match is its own field, `dietMatches`, and not a new severity in the allergen conflicts (a client that treats every conflict as a warning would misread a diet note as one); the hide switch is done on the page, instantly, like the allergen one, so the catalog has no `hideUnmarked` parameter; the cart check reports every line's matches and the form shows only the ones not marked. **Not done / limits:** the vendor has no screen to tag options (assignment is through the API, as for every tag), so "marked" depends on vendors tagging every option; diet preferences are not used by anything but the display (no filtering beyond the switch).

```
WI ID:               TAG-004
Title:                Diet tags in the customer's profile ("prefer")
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-PREFERENCES, EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
```

**Context / Why**
Vegetarian, vegan, halal and kosher are claims a vendor makes, so they cannot be matched the way allergens are. A customer who prefers "vegan" should see which items are marked vegan, and which are not marked, with a softer signal than an allergen conflict. This item is the second use of tags for the customer and depends on the profile (`PREF-001`) and on diet tags existing on listings and options (`TAG-002`).

**Inputs / References**
- *Decisions*: ADR-0022 decisions 5 and 8 (the composition rule is decided here, as an amendment; the wording is the vendor's claim, never "safe").
- *Interfaces*: `PREF-001`'s profile (a new `prefer` list of diet tag ids), `SRCH-001`'s match shape (a new severity, `prefer`), `CUST-005`'s page, `CUST-006`'s highlighting.

**Out of scope**
- Allergens (they are `PREF-001` and `SRCH-001`); interests in occasion, season or theme tags; any filtering the customer did not ask for.

**Requirements / Acceptance Criteria** (outline; to be completed when the decision is made)
- The profile gains `prefer` (diet tag ids, validated against the registry). A listing "not marked" for a preferred diet is shown with a quiet, accessible note; one marked is shown with the bakery's claim. A preference never hides a listing unless the customer turns on the hide toggle for it.
- The composition rule: a configured item is marked for a diet only if the item has the tag and no chosen option contradicts it. How an option contradicts a claim (an explicit "breaks" marker, or an option that must carry the tag) is decided here and recorded as an amendment to ADR-0022.
- The cart check (`SRCH-001`) applies the same rule to the options actually chosen.

**Dependencies**
- Blocked by: `TAG-002`, `PREF-001`, `SRCH-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
After the decision. The composition rule is a product and data-model call.

**Open Points (working)**
- [x] How an option contradicts a diet claim: it must carry the tag (decided 2026-11-04, ADR-0022 amendment).
- [x] Whether "prefer" belongs in the first demo: yes, built now (decided 2026-11-04).
