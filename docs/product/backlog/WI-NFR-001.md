```
WI ID:               NFR-001
Title:                Draft the Non-Functional Requirements document
Type:                 Document/Artifact
Epic:                 (none yet — this is a standalone architecture artifact, not part of a feature epic)
Hat/Owner:            Architect
Status:               Ready
Size:                 M
```

**Context / Why**
`docs/architecture/nfrs.md` currently exists only as a stub (`_TODO: scalability targets, security/compliance assumptions, availability targets feeding the SLA._`). This document needs real content before the SLA/SLO doc can be drafted meaningfully, since the SLA's targets should derive from stated NFRs rather than being invented independently. This item is scoped narrowly to writing the NFR document itself — it is not the SLA item.

**Inputs / References**
- ADR-0004 (data store) — partition-key/scale assumptions already named as v1 guesses; NFRs should state the target load these are valid for
- ADR-0002 (cache) — the accepted per-replica local-cache limitation under horizontal scaling is a direct scalability NFR input
- `docs/architecture/ddd/glossary.md` — the north-star safety metric (dietary-incident-free orders) is a direct input to a security/compliance NFR
- `docs/product/vision.md` — guiding principles, particularly "dietary safety is first-class"

**Out of scope**
- Does not draft the SLA/SLO document itself (separate, later item — this one should be listed as an input to that one)
- Does not include a load-testing plan or actual capacity numbers beyond stated targets/assumptions (that's an operations/testing concern, not this document)

**Requirements / Acceptance Criteria**
- Document covers, at minimum: scalability targets (expected concurrent users/orders at MVP scale, and the assumption ceiling where current architecture choices would need revisiting — e.g., ADR-0004's partition-key assumptions), security assumptions (auth model per ADR-0006, dietary/allergy data handling sensitivity), and compliance assumptions (PCI scope per ADR-0005, single-region/single-currency assumption)
- Each stated NFR traces back to a specific ADR or vision principle — no NFR should be invented without a traceable source
- Explicitly states which NFRs are aspirational/future (e.g., multi-region) vs. binding for v1, using the same scope-status legend as the rest of the project

**Dependencies**
- Blocks: the future SLA/SLO drafting item (SLA targets should derive from these NFRs)
- Blocked by: none — all source ADRs already exist
- Can be worked in parallel with: WI-CACHE-001 and any other in-flight item; this is a documentation task with no code dependency

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: reviewed against the "traces back to a specific ADR" acceptance criterion specifically — a plausible-sounding NFR with no cited source should be treated as not done.

**AI-agent suitability**
Partial. The synthesis of existing ADRs into NFR statements is well within scope for isolated agent execution — all source material is named and bounded (4 references). However, the actual *target numbers* (expected concurrent users, specific latency targets) likely require a human business judgment call this item's references don't resolve on their own; flag those specific fields for human input rather than inventing plausible-sounding numbers.
