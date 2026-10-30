> **Status:** Deferred · trigger: the lead decides to add management artifacts to the portfolio (deferred 2026-10-30)

```
WI ID:               MGMT-003
Title:                RACI for the project (hypothetical team)
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Deferred
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Deferred on purpose: the real working model is one lead plus AI contributors (`docs/management/portfolio-slice/09-owners-and-defaults.md`).

**Context / Why**
A RACI shows who is Responsible, Accountable, Consulted and Informed for the project's main activities. The project is run by one lead with AI agents as contributors, so a RACI is hypothetical; it demonstrates the artifact and shows how the real model maps onto a larger team.

**Inputs / References**
- *Decisions*: `docs/management/portfolio-slice/07-shared-file-ownership-and-coordination.md` and `09` (the real ownership), `docs/process/engineering-standards.md`, `docs/process/branching-strategy.md`
- *Business context*: the role hats in `docs/product/backlog/epic-catalog.md` (Architect, Engineering/Build, Platform Engineering, Product, Operations, Manager/Lead, Governance)

**You do not need to know about**
- Any detail of the code or the individual work items.

**Out of scope**
- Headcount, hiring and budget (`MGMT-006`, `budget-cost-estimate.md`).

**Requirements / Acceptance Criteria**
- Rows for the main activities: deciding an ADR, accepting a work item, merging to `main`, releasing, responding to an incident.
- Columns for the hypothetical roles, each cell R, A, C, I or blank, with exactly one A per row.
- A short section stating that it is hypothetical and mapping today's real model (lead accountable for everything shared; agents contribute) onto it.

**Dependencies**
- Blocked by: none. Related: `MGMT-006`.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. The structure is mechanical once the activities and roles are listed.

**Open Points (working)**
- [ ] Whether to build it at all (deferred; the trigger is the lead's decision).
