> **Status:** Done · evidence: `docs/management/stakeholder-communications-plan.md`

```
WI ID:               MGMT-007
Title:                Draft the stakeholder communications plan
Type:                 Document/Artifact
Epic:                 EPIC-PM-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Manager/Lead
Status:               Done
Size:                 S
```

**Context / Why**
No document currently states who needs to know what, how often, or who gets escalated to when something goes wrong (a budget breach, a risk materializing, a schedule slip). This is role-based, not name-based — `MGMT-006` (team/hiring plan) hasn't been drafted yet, and this document shouldn't block on it, since communication cadence and escalation paths are meaningful even before specific people are named.

**Inputs / References**
- *Decisions*: none new
- *Interfaces*: none
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/operations/sla.md` (error-budget-exhaustion policy — this plan's escalation path should trigger from that, not invent a separate one), `docs/management/risk-register.md` (R-10 schedule risk — this plan's cadence should give that risk somewhere to surface), `docs/management/project-plan.md` (phase boundaries — natural checkpoints for stakeholder updates)

**You do not need to know about**
- Any specific technical implementation — this is a pure process/communication artifact

**Out of scope**
- Does not name real individuals — role-based only, per `MGMT-003`'s (RACI, not yet drafted) eventual pairing
- Does not define the RACI matrix itself (`MGMT-003`, separate item) — this plan defines *cadence and escalation*, RACI defines *who decides what*

**Requirements / Acceptance Criteria**
- Defines stakeholder roles (not names), each with what they need to know and how often
- Defines a regular cadence tied to real checkpoints already in the project (phase boundaries from `project-plan.md`, not invented meeting names)
- Defines an escalation trigger that's concrete, not vague — explicitly wired to the SLA's error-budget-exhaustion policy and the risk register's existing entries, not a generic "escalate if something goes wrong"

**Dependencies**
- Blocks: none · Blocked by: none (deliberately not blocked on `MGMT-006`, per Context/Why above) · Parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes — fully derivable from existing artifacts (SLA, risk register, project plan).

**Open Points (working)**
*(none currently)*
