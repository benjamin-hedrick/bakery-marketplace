> **Status:** In review · built and run locally on `feature/slice-personalization-web` (2026-11-04); the real-stack journey is written but not yet run (register 140)

> **Outcome note (2026-11-04):** built in three steps. (1) The catalog: `ListingDocument` and `ModifierDocument` gain `tags` (the vendor's) and `platformTags` (the platform's, never written by a vendor request); create and update accept `tags` on the listing and on each option, checked by `ListingValidator` against the registry (known id, a kind other than allergen, assignable by a vendor, not retired; each failure named as `tags[i]` or `modifiers[i].tags[j]`) and against the caps; duplicates are removed before counting. `TagProjector` decides what a response shows: public responses (browse, detail, the personalized views) carry the vendor's and the platform's tags that are public, not retired and inside their window today by the catalog's clock, in registry order; the owner's reads (`/mine`) carry only the vendor's own tags, in the order assigned, each with `active` true or false. (2) The BFF: `Listing.tags` and `Modifier.tags` as `[Tag!]!`, mapped as sent (empty for a catalog that sends none). (3) The customer app: chips on the browse list, the detail page and each option (`TagChips`); a diet tag reads "Vegan, marked by the bakery" (screen-reader text on the list and the option, on screen on the detail page); chips are neutral, with no icon and no bold, nothing like an allergen mark. The seed and the registry gained vegan, vegetarian, thanksgiving (window 2026-11-01 to 2026-11-28), birthday, autumn (window), local-favourite and a hidden platform tag `test-hidden` that is on the croissant and must never appear.
>
> **The caps are one setting (the lead's rule, 2026-11-04):** `TagOptions` (`MaxPerListing` 12, `MaxPerOption` 6, configuration section `Tags`). The validator, its messages ("At most 2 tags.") and the tests take them from it; a test runs the whole path with caps of 2 and 1.
>
> **Verified (local):** 21 catalog API tests (assignment accepted in registry order; each refusal named; option rules; duplicates; the caps as a setting and the shipped 12 against 13; an update without `tags` leaves them and `[]` clears the vendor's own; platform tags untouched by a hostile body and by clearing; public responses without a hidden, retired or out-of-window tag, with the window checked the day before, the first day, the last day and the day after, for the listing and for the option; the owner's view with inactive marked; another vendor refused), catalog 248 passed and 7 skipped without the emulator; 4 BFF tests (209 in all); 6 browser tests and 51 unit tests in the customer app (113 browser tests in all, passing). Mutation checks, each failing the intended tests: the window check removed from the projector (4 tests); a vendor update clearing the platform tags (1 test). **Not run:** `tests/skeleton/listing-tags.spec.ts` (the seeded tags reach the browser; the hidden tag is in no response) on the real stack (register 140).
>
> **Changes from the original plan:** an update request without a `tags` list leaves the tags as they were (a client that does not know about tags must not wipe them), and an empty list clears the vendor's own; a vendor who sends back a tag that has since been retired is told to remove it (422, named); the platform's tags do not count against a vendor's cap. **Not done / limits:** the vendor has no screen for tags (assignment is through the API, as the spec says); the real Cosmos container was not exercised with the new fields (the catalog's Cosmos tests ran against the in-memory store only in this session).

```
WI ID:               TAG-002
Title:                Tags on listings and options: vendor assignment, visibility, display
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-WEB-CUSTOMER (chips on browse and detail)
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 M
```

**Context / Why**
With the registry in place (`TAG-001`), the non-allergen kinds (diet, occasion, season, theme) need somewhere to live. ADR-0022 puts them in a `tags` list on the listing and on each option, assigned by vendors for the tags marked vendor-assignable, with visibility and date windows enforced by the catalog.

**Inputs / References**
- *Decisions*: ADR-0022 decisions 3 to 7, ADR-0014 (a public response may lag a window edge by its cache lifetime), ADR-0013.
- *Interfaces*: `TAG-001`'s `ITagRegistry`, the listing DTOs and `ListingService`, the BFF `Listing` and `Modifier` types, the customer app's browse and detail components.

**You do not need to know about**
- Filtering by tag (`TAG-003`); how diet tags combine with chosen options (`TAG-004`); the vendor admin app (not built: assignment is through the API).

**Out of scope**
- Platform assignment of tags (no administrator console yet); editing the registry; any matching against a customer.

**Requirements / Acceptance Criteria**
- `ListingDocument` and `ModifierDocument` gain `tags` (ids). Create and update accept `tags` on the listing (at most 12) and on each option (at most 6); every id must be in the registry, of a kind other than `allergen` (allergens stay in their own fields), `assignableBy: vendor` and not retired, else 422 naming the field and value. Duplicates are removed.
- Platform-assigned tags are stored in a separate list (`platformTags`) that no vendor request can set or clear: a vendor update leaves it as it was.
- **Public responses** (browse, detail, and the option lists inside them) carry only tags that are public and inside their window now, evaluated with the catalog's time source. A hidden tag, a retired tag or one outside its window never appears in a listing, an option, the registry endpoint, or the BFF schema. The vendor's own reads (`/mine`) show the vendor's own assigned tags including inactive ones, marked inactive.
- **BFF:** `Listing.tags` and `Modifier.tags` as `[Tag!]!` with id, label and kind, mapped as sent.
- **Customer app:** tags show as chips on the browse list and the detail page, and next to an option's name. A diet tag reads as the bakery's claim ("Vegan, marked by the bakery" in the accessible label and the detail page; the chip may be short). A tag is never styled like an allergen warning.
- **Seed data** gains a few diet and occasion tags (including one seasonal tag with a window, and one hidden platform tag used only by tests).
- **Tests:** assignment accepted and refused (unknown id, allergen kind, platform-only, hidden, retired, over the caps); platform tags untouched by a vendor update; visibility and windows at both edges with a fake clock, for listings and for options; a hidden tag absent from every public response and from the BFF; chips on browse and detail in the browser against the mock BFF and on the real stack.

**Dependencies**
- Blocks: `TAG-003`, `TAG-004`.
- Blocked by: `TAG-001`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. The visibility rule is the one that needs care and has tests at its edges; the lead's review of the caps (12 and 6) is wanted.

**Open Points (working)**
- [x] The caps (12 per listing, 6 per option) were approved by the lead on 2026-11-04, to stay easy to adjust: one setting (`TagOptions`).
