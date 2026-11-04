> **Status:** Ready

```
WI ID:               TAG-003
Title:                Filter the public browse by tag
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-SEARCH, EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build
Status:               Ready
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
- [ ] The browse reads and filters in memory, as the vendor list does; check the cost with the seed volume and note it in the register if it grows with listings.
