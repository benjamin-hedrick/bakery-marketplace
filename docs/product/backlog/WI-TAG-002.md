> **Status:** Ready

```
WI ID:               TAG-002
Title:                Tags on listings and options: vendor assignment, visibility, display
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-WEB-CUSTOMER (chips on browse and detail)
Hat/Owner:            Engineering/Build
Status:               Ready
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
- [ ] The caps (12 per listing, 6 per option) are proposals.
