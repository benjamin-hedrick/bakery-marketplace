> **Status:** Done · evidence: `docs/operations/sla.md`

```
WI ID:               OPS-001
Title:                Draft the SLA/SLO document
Type:                 Document/Artifact
Epic:                 EPIC-OPS-ARTIFACTS
Shared with epic(s):  none
Hat/Owner:            Operations
Status:               Done
Size:                 S
```

**Context / Why**
`docs/operations/sla.md` currently exists only as a stub. Per `WI-NFR-001`'s own Dependencies field, this document's targets must derive from the NFR document (now complete), not be invented independently — the whole point of drafting NFRs before code was to give this exact document real numbers to build from.

**Inputs / References**
- *Decisions*: `docs/architecture/nfrs.md` §1–2 (target load, target availability — the direct source for this document's numbers), ADR-0002 (cache fallback — a real, named failure mode worth a runbook-adjacent SLA note), ADR-0004 (Cosmos throttling ceiling), ADR-0008 (APIM has no Azure-backed SLA at Consumption tier — this is *why* the availability target is self-imposed, not inherited)
- *Interfaces*: none consumed
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable — this produces a document, not testable code
- *Business context*: `docs/product/vision.md` principle 4 (ship small, real thing) — this SLA should be honest about being a demo-scale, self-imposed target, not an inflated promise

**You do not need to know about**
- Any specific service's internal implementation details — this document works at the level of "the platform," not per-service internals
- Actual monitoring/alerting tooling configuration (`OPS-003`, separate item) — this document states *what* the targets are, not *how* they're measured/enforced

**Out of scope**
- Does not include the runbook itself (`OPS-002`, separate item) — this document should reference it once it exists, not duplicate its content
- Does not include a monitoring/alerting implementation plan (`OPS-003`, separate item)
- Does not cover on-call rotation (`OPS-004`, separate item)

**Requirements / Acceptance Criteria**
- States the uptime target (99.0% monthly) and derived error budget (~7.3 hours/month), sourced explicitly from `nfrs.md` §2, not restated as a fresh number
- States that this is a **self-imposed target, not an Azure-backed guarantee** — explicit, not implied, per ADR-0008's finding that Consumption-tier services carry no SLA of their own
- States what happens when the error budget is exhausted in a given month (e.g., a defined response: feature-flag freeze, incident review) — even a lightweight, portfolio-appropriate policy, not left unstated
- States a latency target for the customer-facing read paths (browse/search), informed by the target-load numbers in `nfrs.md` §1
- Names the known failure modes this SLA has to account for, each traced to its source: cache fallback to local (ADR-0002), Cosmos throughput ceiling (ADR-0004), APIM's lack of its own SLA at this tier (ADR-0008)
- Does not invent a number without a stated source — same discipline as `WI-NFR-001`

**Dependencies**
- Blocks: `OPS-002` (runbook) and `OPS-003` (monitoring/alerting plan) benefit from this existing first, though aren't strictly blocked
- Blocked by: none — `NFR-001` is done
- Can be worked in parallel with: any other Document/Artifact item

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: every number in this document should trace to `nfrs.md` or a named ADR — if a reviewer asks "where did 99.0% come from," the answer is a citation, not "it seemed reasonable."

**AI-agent suitability**
Yes. All source numbers already exist in `nfrs.md`; no new business judgment call is required the way `NFR-001`'s target-load number was — this item is synthesis, not a fresh decision.

**Open Points (working)**
*(none currently)*
