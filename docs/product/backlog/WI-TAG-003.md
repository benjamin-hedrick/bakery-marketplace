> **Status:** In review · built and run locally on `feature/slice-personalization-web` (2026-11-04); real-stack journeys passed on a clean stack (2026-11-04)

> **Outcome note (2026-11-04):** built in three steps. (1) The catalog: `GET /catalog/listings?tag=a&tag=b` returns the published listings that carry **all** the tags on the listing itself (the vendor's or the platform's; a tag on an option does not select the listing), narrowing before paging so pages are full and the cursor still means "after this id". `TagFilter` accepts an id only if it is public, not retired, inside its window today and not an allergen; every other id (unknown, hidden, retired, out of window, allergen) is a 422 `validation_failed` with the same words at `tag[i]`, so a hidden tag cannot be found by asking (a test compares the two bodies word for word). More than `TagOptions.MaxFilterTags` (10, a setting) is refused. Ids are matched without regard to case and repeats are ignored. The cache headers equal the unfiltered browse's (none are set by either). (2) The BFF: `listings(first, after, tags: [ID!])`; a 422 from the catalog is one `BAD_INPUT` in the BFF's own words for every reason. (3) The home page reads `?tag=` on the server (`parseTagQuery` keeps the address tidy: lower case, the shape of an id, at most 10, no repeats), shows the tags the catalog shows today as filter chips that are plain links (selected ones say so and remove themselves; allergens are never offered), says "No listings match these tags" with a way to clear, and sends an address with a refused tag back to the whole list instead of an error. The customer's own conflict marks still lie over a filtered list.
>
> **Verified (local):** 19 catalog API tests (one tag, two, option-only, a public platform tag, case and repeats, each refusal and the identical words, the window at both edges, paging with a filter, the limit, cache headers, a retired tag on a listing); catalog 267 passed, 7 skipped without the emulator; 3 BFF tests (212 in all); 7 unit tests and 9 browser tests in the customer app (58 unit and 122 browser tests in all, passing). Mutation checks, each failing the intended test: "all" changed to "any"; the allergen refusal removed. **Real stack (2026-11-04, passed):** `tests/skeleton/listing-tags.spec.ts` ran in the full `skeleton-smoke.mjs --containers` run on a clean stack (55 of 55 journeys passed). (the filter journeys)
>
> **Changes from the original plan:** an allergen id is refused as a filter (the spec said a public, active tag): allergens are not in a listing's tags, so a filter on one would match nothing and read as "nothing contains it", which the product must never say; the filter limit is a setting like the caps; the page's refusal path is a redirect to the unfiltered page. **Not done / limits:** the browse still reads every published listing and filters in memory, as before (register 143); "any of" filters and counts stay with `TAG-005`.

```
WI ID:               TAG-003
Title:                Filter the public browse by tag
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-SEARCH, EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build
Status:               In review
Size:                 S
```

**Context / Why**
Tags that cannot be searched on are only labels. This item lets the public listing page be narrowed by one or more tags (vegan, a holiday, a theme), which is the first use of tags for discovery. It stays anonymous and cacheable.

**Inputs / References**
- *Decisions*: ADR-0022 (visibility is the catalog's job), ADR-0014 (a filtered response is a different cache key), ADR-0012 (the public listing page is rendered on the server).
- *Interfaces*: `GET /catalog/listings` (`ListingService.BrowseAsync`), the BFF `listings` query, the home page.

**You do not need to know about**
- Matching against a customer's profile (`SRCH-001`); ranking or sponsored placement (`SRCH-002`, `SRCH-003`).

**Out of scope**
- "Any of" filters, facet counts, collections and landing pages by tag (`TAG-005`).

**Requirements / Acceptance Criteria**
- `GET /catalog/listings?tag=a&tag=b` returns the published listings that carry **all** the given tags on the listing itself (a tag on an option does not select the listing). Paging works as it does now.
- An id that is not a public, active, non-retired tag is a 422 `validation_failed`, and a hidden tag's id is refused exactly as an unknown one is, so the endpoint cannot be used to find hidden tags.
- A listing carries a tag for this purpose only while the tag is public and in its window (the same rule as the response).
- BFF: `listings(first, after, tags: [ID!])`; a refusal from the catalog maps to the schema's validation error. The home page reads a `?tag=` query string on the server render and shows the tags that exist as filter chips (selected chips are links, so the page stays anonymous and cacheable); a filter with no result says so.
- **Tests:** one tag, two tags, a tag on an option only, an unknown id, a hidden id, a retired id, an out-of-window id; paging with a filter; the browser test of the chips, the query string and the empty state; the cache headers equal the unfiltered endpoint's.

**Dependencies**
- Blocks: none.
- Blocked by: `TAG-002`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Open Points (working)**
- [x] The browse reads and filters in memory, as the vendor list does: recorded as register 143 (no change in cost class; a filter adds one pass over what is already read).
