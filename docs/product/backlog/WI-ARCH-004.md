```
WI ID:               ARCH-004
Title:                Formal Event-Storming Session Output
Type:                 Document/Artifact
Epic:                 EPIC-ARCH-DOCS
Shared with epic(s):  none
Hat/Owner:            Architect
Status:               Done
Size:                 M
```

**Context / Why**
Domain events have been named piecemeal across the glossary, ADR-0003, and ARCH-003, but no artifact walks the actual business processes end-to-end the way a real event-storming session would — Commands → Aggregates → Events → Policies/reactions → Read Models, in process order. Doing this properly is likely to surface events that were never named, the same way drawing the C4 container diagram surfaced the service-mapping gap (ADR-0009) — that should be expected and handled the same way, not treated as a failure.

**Inputs / References**
- *Decisions*: ADR-0003 (event names, delivery semantics), ADR-0004 (aggregates), ADR-0009 (service groupings)
- *Interfaces*: none new
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/architecture/ddd/glossary.md` (existing event names — this exercise may add to this list, not just consume it), `docs/architecture/data-model-api-contracts.md` (existing containers/events per service)

**You do not need to know about**
- Any technical implementation detail beyond what's needed to name a Command/Event/Policy correctly

**Out of scope**
- Does not redesign any existing aggregate or container — uses what ADR-0004/ARCH-003 already established
- Does not decide new bounded contexts — organizes by the services/contexts already named

**Requirements / Acceptance Criteria**
- Covers the main business processes end-to-end: vendor onboarding & listing publication, the order lifecycle, review submission, payout reconciliation, and listing moderation
- Uses standard event-storming vocabulary (Command, Aggregate, Domain Event, Policy, Read Model, External System) consistently
- Any newly-identified event not already in the glossary gets added there — this document doesn't introduce vocabulary that lives only in itself
- Any newly-identified event affecting an existing service's published/consumed event list (`data-model-api-contracts.md`) gets that document corrected, not just noted here

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: `ARCH-005`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: if this exercise adds new events, check that both the glossary and `data-model-api-contracts.md` were actually updated, not just this document.

**AI-agent suitability**
Yes — this is a structured synthesis of existing decisions, with the expectation (not a risk) that it surfaces small naming gaps to close, the same shape of task as `ARCH-001`/`ARCH-003`.

**Open Points (working)**
*(none currently)*
