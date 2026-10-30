> **Status:** In review · decision: ratings to be confirmed by the lead

```
WI ID:               MGMT-002
Title:                Draft the risk register
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               In review
Size:                 M
```

**Context / Why**
Real, named risks already exist scattered across `docs/governance/open-items-register.md` and the "accepted limitations" sections of ADR-0001 through ADR-0009 — but nothing pulls them together into a single, prioritized, PM-facing register with likelihood/impact and an explicit response, which is the format a lead or reviewer actually expects. `open-items-register.md` was explicitly designed as a staging area for GitHub Issues, not a risk-management artifact — this item has a different job.

**Inputs / References**
- *Decisions*: ADR-0002 (Redis tier, secret unavoidable), ADR-0004 (shared RU budget, security blast radius, unvalidated partition keys), ADR-0005 (chargebacks deferred, single-region/currency), ADR-0006 (no centralized policy engine), ADR-0007 (no live secret rotation), ADR-0008 (no VNet enforcement at Consumption tier)
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/governance/open-items-register.md` (source for most technical risk entries), `docs/product/backlog/epic-catalog.md`'s Open Item #GOV-002 (legal artifacts undecided)

**You do not need to know about**
- Any risk's full technical remediation detail — reference the ADR/open-item, don't re-derive the fix here
- Sprint-level execution risk (a single work item running late) — this register is project-level, not task-level

**Out of scope**
- Does not duplicate `open-items-register.md` verbatim — synthesizes into risk-register format (likelihood/impact/response), cross-referencing rather than copying
- Does not include a formal quantitative risk-scoring model (e.g., numeric risk scores) — qualitative High/Medium/Low is sufficient at this project's scale

**Requirements / Acceptance Criteria**
- Every technical risk traces to a specific ADR or open item — no invented risks
- Includes at least one project-management-level risk not already captured elsewhere (e.g., schedule/scope risk given the backlog's size relative to likely solo/small-team pace) — this is the kind of risk a pure architecture review wouldn't surface, and worth this document adding real value beyond just reformatting existing entries
- Chargeback/dispute handling (Open Item #6) is the first substantive entry, per the original plan
- Each entry has: likelihood, impact, response/mitigation, and source reference

**Dependencies**
- Blocks: none
- Blocked by: none
- Can be worked in parallel with: `MGMT-001` (project plan)

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every entry's source reference should be checked for accuracy — a risk with a wrong or missing citation should be treated as not done.

**AI-agent suitability**
Partial. Compiling and cross-referencing existing risks is fully agent-suitable. Likelihood/impact ratings involve a real judgment call — reasonable defaults can be proposed, but should be explicitly flagged as adjustable rather than presented as objectively measured.

**Open Points (working)**
- [ ] Likelihood/impact ratings are proposed defaults, not measured — confirm or adjust
