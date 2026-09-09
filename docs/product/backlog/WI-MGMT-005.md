```
WI ID:               MGMT-005
Title:                Draft the budget / cost estimate
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Review — content complete, 1 open decision remains (labor/time cost, see below)
Size:                 S
```

**Context / Why**
`tech-stack.md` establishes free-tier-first as a principle across every ADR, but no document pulls the actual dollar figures together into one place a reviewer would expect labeled "budget." Since the architecture is genuinely free-tier-first by design, this should mostly confirm $0 across the stack — with the one real exception (managed Redis, ADR-0002) named precisely, not vaguely.

**Inputs / References**
- *Decisions*: ADR-0002 (managed Redis is the one non-free component, environment-conditional), ADR-0004/0005/0006/0007/0008 (each names its own free-tier grant)
- *Interfaces*: none
- *Environment/tooling*: `docs/architecture/tech-stack.md` (cloud stack table — the source for every service's tier/cost row)
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/nfrs.md` §1 (target load — the basis for confirming free-tier headroom actually holds at this scale)

**You do not need to know about**
- Any service's technical implementation — only its pricing tier and whether that tier is free at the stated target load

**Out of scope**
- Does not include labor/time cost — that's a personal/business decision this document can't invent, flagged as an Open Point rather than assumed
- Does not include a cost model for scale beyond the target load in `nfrs.md` §1 — that's a revisit-when-it-happens item, not a speculative projection

**Requirements / Acceptance Criteria**
- Every service in `tech-stack.md`'s cloud stack table gets a cost line, sourced from that table, not re-researched independently where already stated
- The one real cost (managed Redis) is stated with an actual current price, not "a few dollars" — verified against Azure's own pricing, not assumed
- States explicitly that infrastructure cost and labor/time cost are two different axes, and only the former is estimated here

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: the Redis price point should be checked against a live source at time of drafting, not carried forward from an earlier casual estimate in conversation.

**AI-agent suitability**
Yes, with one flagged exception — labor/time cost is explicitly out of scope and cannot be invented.

**Open Points (working)**
- [ ] Labor/time cost estimate — a personal/business decision, not invented here
