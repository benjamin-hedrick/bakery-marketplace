> **Status:** Ready

```
WI ID:               CUST-005
Title:                Allergen profile page
Type:                 Service Implementation
Epic:                 EPIC-WEB-CUSTOMER
Shared with epic(s):  EPIC-PREFERENCES
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

> **Rewritten 2026-11-04.** Git keeps the original (free-text tags for allergies and dietary preferences). What changed: the page edits the allergen profile of `PREF-001` through the BFF, as a list of the registry's allergens with one choice each (Not set, Avoid, Allergy), not free text; diet preferences are `TAG-004`.

**Context / Why**
A profile that can only be set by an API call is not usable. The page is where a customer tells the product which allergens matter. It must be easy to find (vision principle 1) and honest about what the product knows.

**Inputs / References**
- *Decisions*: ADR-0022, ADR-0012 and ADR-0019 (client-rendered behind the login), ADR-0014, NFR 3.7, vision principle 1.
- *Interfaces*: the BFF `tags(kind: ALLERGEN)`, `preferences` and `savePreferences` (`TAG-001`, `PREF-001`), `RequireLogin`, the header.

**You do not need to know about**
- How conflicts are computed or drawn (`SRCH-001`, `CUST-006`, `CUST-008`).

**Out of scope**
- Diet preferences; a profile for anyone but the logged-in customer; deleting the account or its data.

**Requirements / Acceptance Criteria**
- A page `/preferences` behind the login, linked from the header ("Allergies") so it is not buried in a menu, listing every allergen from the registry with three choices each: **Not set**, **Avoid** (a preference) and **Allergy** (serious). One allergen has one choice, so the two lists cannot overlap.
- Short, plain wording under the title: *Bakeries mark what their items contain. An item that is not marked is not guaranteed free of anything, so check with the bakery when it matters.* The page never says "safe".
- A new customer sees every allergen as Not set and can save at once; saving shows a visible confirmation, and a failed save is distinguishable from a successful one and keeps the choices on the screen. Clearing every choice and saving clears the profile.
- The page is rendered in the browser only (no profile data in the server HTML), the request is network-only and private, and logging out drops what the page learned.
- Accessible: each allergen is a labelled group of radio buttons; state is never conveyed by colour alone.
- **Tests:** against the mock BFF (a new customer, setting each choice, saving, a failed save, a reload showing what was saved, logout clearing the page, no profile data in the server HTML) and on the real stack (set an allergy and see it come back; a vendor login is refused).

**Dependencies**
- Blocks: `CUST-006`, `CUST-008` (they are more useful with real browser-entered data).
- Blocked by: `PREF-001`, `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Open Points (working)**
*(none currently)*
