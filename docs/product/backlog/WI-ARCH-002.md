```
WI ID:               ARCH-002
Title:                Capability Map / Business Architecture View
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Done
Size:                 S
```

**Context / Why**
Every architecture artifact so far (bounded context map, C4, ADRs) is technical-audience-facing. Nothing presents the system as a business would describe it — capabilities, not bounded contexts. This is explicitly a re-grouping of what already exists (per `bounded-contexts.md` and ADR-0009's service mapping), not a re-decision of anything; its value is the different audience it serves, particularly the Executive Sponsor role named in `stakeholder-communications-plan.md`.

**Inputs / References**
- *Decisions*: ADR-0009 (which service hosts which bounded context — this map should stay consistent with that, not invent a different grouping)
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/bounded-contexts.md` (the core/supporting/generic classification this reuses, not re-derives), `docs/product/personas.md` (which persona each capability serves), `portfolio-plan.md` (the MVP-line legend this map's priority column reuses)

**You do not need to know about**
- Any technical implementation detail — this document is intentionally non-technical

**Out of scope**
- Does not re-classify anything already classified in `bounded-contexts.md` — reuses that classification
- Does not introduce a new priority/maturity scale — reuses the existing MVP/MVP-lite/Deferred legend

**Requirements / Acceptance Criteria**
- Organizes bounded contexts into business-facing capability domains (not the DDD context names themselves) — a non-technical reader should recognize these as business capabilities, not code boundaries
- Each capability traces to the specific bounded context(s) that implement it, and the service that hosts it per ADR-0009 — no orphaned capabilities
- Each capability names which persona (from `personas.md`) it primarily serves
- Reuses the existing core/supporting/generic classification and MVP-line legend rather than inventing new categories

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every capability's context/service mapping should be checked against `bounded-contexts.md` and ADR-0009 for consistency, not just plausibility.

**AI-agent suitability**
Yes — this is a re-grouping of already-decided material for a different audience, not a fresh decision.

**Open Points (working)**
*(none currently)*
