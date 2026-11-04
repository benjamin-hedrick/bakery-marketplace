> **Status:** Proposed · decision: the lead, on how a chosen option changes a diet claim and on whether "prefer" is wanted in the first demo

```
WI ID:               TAG-004
Title:                Diet tags in the customer's profile ("prefer")
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-PREFERENCES, EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build
Status:               Proposed
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
- [ ] How an option contradicts a diet claim.
- [ ] Whether "prefer" belongs in the first demo or follows it.
