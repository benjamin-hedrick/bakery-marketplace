```
WI ID:               NFR-001
Title:                Draft the Non-Functional Requirements document
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Done
Size:                 M
```

**Context / Why**
`docs/architecture/nfrs.md` currently exists only as a stub. This document needs real content before the SLA/SLO doc can be drafted meaningfully, since the SLA's targets should derive from stated NFRs rather than being invented independently. This item is scoped narrowly to writing the NFR document itself — it is not the SLA item. It also has to close two specific, previously-uncaptured gaps: a zero-trust security posture that existed only as an unstated assumption until ADR-0008 surfaced it, and CSRF/injection protection, which had never been written down anywhere despite being raised as a concern.

**Inputs / References**
- *Decisions*: ADR-0004 (data store — partition-key/scale assumptions already named as v1 guesses), ADR-0002 (cache — accepted per-replica local-cache limitation under horizontal scaling), ADR-0006 (auth model — **including its token-storage note**, which is the direct source for this document's CSRF analysis), ADR-0005 (PCI scope, single-region/currency assumption)
- *Interfaces*: none consumed — this is a document, not code
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable — this item produces a document, not testable code
- *Business context*: `docs/product/vision.md` — guiding principles, particularly principle 1 (dietary safety) and **principle 5 (zero trust)**; `docs/architecture/ddd/glossary.md` for the north-star safety metric

**You do not need to know about**
- Vendor onboarding, advertising, payments business logic, or any other domain-specific feature work — this document's scope is system-wide non-functional properties, not feature behavior
- The actual implementation details of any service — reference the ADRs' decisions, don't re-derive requirements from imagining how the code works

**Out of scope**
- Does not draft the SLA/SLO document itself (separate, later item — this one should be listed as an input to that one)
- Does not include a load-testing plan or actual capacity numbers beyond stated targets/assumptions (that's an operations/testing concern, not this document)

**Requirements / Acceptance Criteria**
- Document covers, at minimum: scalability targets (expected concurrent users/orders at MVP scale, and the assumption ceiling where current architecture choices would need revisiting — e.g., ADR-0004's partition-key assumptions), security assumptions (auth model per ADR-0006, dietary/allergy data handling sensitivity), and compliance assumptions (PCI scope per ADR-0005, single-region/single-currency assumption)
- **Explicitly states the zero-trust posture** (vision principle 5) as a binding security NFR, not just a mention — every service authoritatively validates its own auth regardless of what's in front of it
- **Explicitly states the CSRF analysis**: under the current header-only token design (ADR-0006), classic CSRF does not apply by construction; state this as a reasoned conclusion with its stated precondition (no cookie-based token storage), not as a silent omission — so that if a future item ever introduces cookie-based storage, this document's conclusion is visibly invalidated rather than just quietly wrong
- **Explicitly states the injection-protection baseline**: parameterized/ORM-based data access required for all Cosmos SDK queries, no raw query string construction — cross-reference `docs/process/engineering-standards.md` where the coding-standard side of this lives
- Each stated NFR traces back to a specific ADR or vision principle — no NFR should be invented without a traceable source
- Explicitly states which NFRs are aspirational/future (e.g., multi-region) vs. binding for v1, using the same scope-status legend as the rest of the project

**Dependencies**
- Blocks: the future SLA/SLO drafting item (SLA targets should derive from these NFRs)
- Blocked by: none — all source ADRs already exist
- Can be worked in parallel with: WI-CACHE-001 and any other in-flight item; this is a documentation task with no code dependency

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: reviewed against the "traces back to a specific ADR" acceptance criterion specifically — a plausible-sounding NFR with no cited source should be treated as not done. The zero-trust and CSRF statements specifically should be checked against ADR-0006's actual wording, not paraphrased loosely.

**AI-agent suitability**
Partial. The synthesis of existing ADRs into NFR statements — including the zero-trust and CSRF sections, since both now have an explicit source ADR to draw from — is well within scope for isolated agent execution. However, the actual *target numbers* (expected concurrent users, specific latency targets) likely require a human business judgment call this item's references don't resolve on their own; flag those specific fields for human input rather than inventing plausible-sounding numbers.

**Open Points (working)**
*(none — resolved: 50 peak concurrent users / 200 orders/day target load, 99.0% monthly target availability, both committed to `docs/architecture/nfrs.md`)*
