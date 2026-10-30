> **Status:** Done · evidence: `docs/governance/architecture-review.md`

```
WI ID:               GOV-001
Title:                Fill in the architecture review / change-management document
Type:                 Document/Artifact
Epic:                 EPIC-GOVERNANCE
Shared with epic(s):  none
Hat/Owner:            Governance
Status:               Done
Size:                 S
```

> **Changes from the original plan (2026-10-30).** The plan also required the document to distinguish this project's ADR governance from a separate process-framework repository's template governance. This repository no longer refers to that repository, so that requirement was dropped and `architecture-review.md` was rewritten without it. The rest was delivered as planned.

**Context / Why**
`docs/governance/architecture-review.md` is a one-line stub. This project has actually been *practicing* a real governance discipline throughout (state assumptions before drafting, periodic reference-doc audits, an explicit "surprise as a trigger" rule, ADR amendment-not-rewrite) — this item's job is to write down what's already being done, not invent a new process from scratch.

**Inputs / References**
- *Decisions*: ADR-0006's amendment note (a concrete precedent for "amend, don't rewrite"), and `docs/architecture/adr/template.md` with the practice already used for every ADR from 0002 on (the source of most of this document's content)
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: the surprise rule (a discovery that a decision was never made is itself the trigger to record one; `docs/method/glossary.md`)

**You do not need to know about**
- Any specific technical ADR's content — this document is about the *process* of deciding, not any one decision

**Out of scope**
- Does not cover how the documentation method itself changes (that is `docs/method/`); this document governs *this project's* ADRs.
- Does not cover day-to-day code review (`docs/process/engineering-standards.md`'s job) or business/scope decisions (`docs/product/vision.md`'s guiding principles / the business-decision-checklist's job)

**Requirements / Acceptance Criteria**
- States this document's scope: this project's own ADR lifecycle
- Documents how a new ADR gets proposed and accepted, citing the actual practice already used (state assumptions first, one decision per ADR)
- Documents how an existing ADR gets revisited, citing the actual precedent (ADR-0006's amendment note) rather than inventing a new mechanism
- States a concrete review cadence for shared reference docs (`tech-stack.md`, `nfrs.md`), citing when this has actually happened before (after ADR-0002/0003, after ADR-0006/0007/0008/0009) as the basis for the stated cadence, not a made-up number
- Explicitly states the "surprise as a trigger" rule as a governance mechanism, not just an AI-collaboration habit — it's already functioned as one (ADR-0009's own origin)

**Dependencies**
- Blocks: none · Blocked by: none · Parallel with: `OPS-003`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — this is entirely a synthesis of practices already demonstrated in this project's own history, not a fresh decision.

**Open Points (working)**
*(none currently)*
