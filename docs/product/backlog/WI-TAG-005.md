> **Status:** Deferred · revisit when the administrator service and console exist, or when the lead asks for collections

```
WI ID:               TAG-005
Title:                Seasonal and themed surfaces, and administrator editing of the registry
Type:                 Service Implementation
Epic:                 EPIC-TAGS
Shared with epic(s):  EPIC-ADMIN
Hat/Owner:            Engineering/Build
Status:               Deferred
Size:                 L
```

**Context / Why**
The registry already carries visibility, `assignableBy` and active windows (`TAG-001`, `TAG-002`). This item is what makes them useful at scale: pages and rows for a holiday, season or theme that appear and disappear with their windows, facet counts, and an administrator editing the registry (and platform-assigned tags) with an audit trail, instead of a file in a pull request.

**Inputs / References**
- *Decisions*: ADR-0022 (the registry sits behind `ITagRegistry`; the future uses are listed there), ADR-0009 (the administrator service).

**Out of scope until it is taken up**
- Everything. Candidate contents: collection and landing pages by tag; an "in season now" row driven by windows; facet counts on the browse; recurring windows (dayparts) and region-bound visibility; platform assignment of tags to listings; tag merge and retirement; translated labels; hidden tags as ranking and moderation signals.

**Requirements / Acceptance Criteria**
- To be written when the trigger is met.

**Dependencies**
- Blocked by: `TAG-002`; the administrator service and console for the editing part.

**Open Points (working)**
- [ ] The trigger, and which of the candidates comes first.
