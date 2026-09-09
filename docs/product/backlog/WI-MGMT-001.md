```
WI ID:               MGMT-001
Title:                Draft the execution-level project plan
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Review — content complete, 1 open decision remains (see below)
Size:                 M
```

**Context / Why**
`portfolio-plan.md` captures scope, the MVP-line legend, and artifact ownership by role — it's a planning document, not a schedule. `MASTER-BACKLOG-OUTLINE.md`'s "Suggested Build Order" sequences epics but doesn't frame them as phases with entry/exit criteria or a current-status marker. This item is the missing piece: a phased execution view a lead would actually track progress against, without duplicating either existing document's content.

**Inputs / References**
- *Decisions*: none directly — this synthesizes existing planning artifacts, it doesn't make new technical decisions
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `portfolio-plan.md` (scope/legend), `MASTER-BACKLOG-OUTLINE.md` (epic list + Suggested Build Order — this document should reference that ordering, not re-derive it), `docs/ACTIVITY-LOG.md` (what's actually been completed so far, to seed the "current status" marker accurately)

**You do not need to know about**
- Any specific technical decision's internal rationale — reference the ADR by number, don't re-explain it
- Individual work-item detail — this document works at the phase/epic level, not the story level

**Out of scope**
- Does not restate `MASTER-BACKLOG-OUTLINE.md`'s epic list — references it
- Does not include calendar dates — see Requirements below on why, and the flagged assumption this creates
- Does not include budget figures (separate item, `MGMT-005`)

**Requirements / Acceptance Criteria**
- Organized as phases (not calendar dates — see Open Points), each with an objective, its constituent epics (by reference, not restated), and explicit entry/exit criteria
- Includes a "current status" marker showing which phase(s) are actually done/in-progress/not-started, sourced from `ACTIVITY-LOG.md` and `project-log.md`, not guessed
- Explicitly states the assumption that phases are sequenced relatively (this phase before that one), not scheduled to calendar dates, since actual pace depends on available hours/week — a real input this document can't invent

**Dependencies**
- Blocks: none
- Blocked by: none
- Can be worked in parallel with: `MGMT-002` (risk register) — related but independent documents

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every phase's constituent-epic list should be checked against `MASTER-BACKLOG-OUTLINE.md` for accuracy, not just plausibility.

**AI-agent suitability**
Yes, with one flagged exception. Phase structure and current-status marker are fully derivable from existing artifacts. Whether to add real calendar-date targets (vs. staying relative) is a genuine business/pacing decision this item can't resolve on its own — flagged as an Open Point rather than assumed.

**Open Points (working)**
- [ ] Relative phase sequencing vs. real calendar-date targets — needs a decision on available pace (hours/week), not invented here
