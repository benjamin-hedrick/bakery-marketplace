```
WI ID:               OPS-003
Title:                Draft the monitoring/alerting plan
Type:                 Document/Artifact
Epic:                 EPIC-OPS-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Operations
Status:               Done
Size:                 M
```

**Context / Why**
`docs/operations/sla.md` states targets (99.0% availability, latency targets, named failure modes) but nothing yet defines what's actually watched or when an alert fires. This document is the policy layer — what to monitor, what the thresholds are, why — distinct from `EPIC-OBSERVABILITY`'s `OBS-001`/`OBS-002`/`OBS-003` items, which are the implementation layer (wiring Application Insights, building the actual dashboards against these thresholds). This item should exist first; the observability epic's items implement against it, not the other way around — a cross-reference in that epic needs correcting to reflect this direction.

**Inputs / References**
- *Decisions*: `docs/architecture/tech-stack.md` (Observability row — Application Insights + Azure Monitor already confirmed as the tooling; this item doesn't re-decide that), ADR-0002 (cache fallback trigger), ADR-0004 (Cosmos RU/s ceiling), ADR-0003 (Event Grid ops ceiling), ADR-0008 (APIM calls ceiling)
- *Interfaces*: none
- *Environment/tooling*: not applicable — tooling already decided in `tech-stack.md`
- *Test/chaos methodology*: not applicable
- *Business context*: `docs/operations/sla.md` (every threshold here should trace to a target or ceiling already stated there), `docs/management/stakeholder-communications-plan.md` (this document's alerts are what technically fires the escalation triggers that plan defines)

**You do not need to know about**
- Any specific service's internal code — this is what gets watched from the outside, not how each service is implemented

**Out of scope**
- Does not pick the observability tooling — already decided (`tech-stack.md`)
- Does not build the actual dashboards/alert rules — that's `EPIC-OBSERVABILITY`'s implementation-layer items
- Does not define the runbook response to an alert — that's `OPS-002`, separate item; this document says *when* to alert, not *what to do* once alerted

**Requirements / Acceptance Criteria**
- Every threshold traces to a ceiling or target already named in `nfrs.md`/`sla.md`/an ADR — no invented numbers
- Defines warning vs. critical thresholds (e.g., warn at 70% of a free-tier ceiling, critical at 90%) for each of: Cosmos RU/s, Event Grid ops/month, APIM calls/month, cache fallback frequency, per-path latency (from `sla.md`'s table), SLA error-budget burn rate
- Explicitly states this document's relationship to `EPIC-OBSERVABILITY` — policy vs. implementation — and that the epic's existing cross-reference note needs correcting to reflect that direction

**Dependencies**
- Blocks: `EPIC-OBSERVABILITY`'s `OBS-001`/`OBS-002`/`OBS-003` benefit from this existing first
- Blocked by: none — `OPS-001` (SLA/SLO) is done
- Can be worked in parallel with: `GOV-001`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every threshold should be traceable to a specific document/ADR — a plausible-sounding percentage with no cited ceiling should be treated as not done.

**AI-agent suitability**
Yes — every ceiling this document references already exists in `nfrs.md`/`sla.md`/ADRs; thresholds are derived (e.g., 70%/90% of an existing ceiling), not freshly invented business numbers.

**Open Points (working)**
*(none currently)*
