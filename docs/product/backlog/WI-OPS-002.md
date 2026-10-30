> **Status:** Done · evidence: `docs/evidence/runbook-event-broker-2026-10-30.md`; the runbook is `docs/operations/runbooks/event-broker-unavailable-during-checkout.md`

```
WI ID:               OPS-002
Title:                Runbook: first scenario and the template
Type:                 Document/Artifact
Epic:                 EPIC-OPS-ARTIFACTS
Shared with epic(s):  EPIC-BACKUP-DR (BDR-003 is a disaster-recovery runbook)
Hat/Owner:            Operations
Status:               Done
Size:                 S
```

> Created 2026-10-30 from a title-only entry in the epic catalog, so the item shows up in `STATUS.md`. Build one runbook, test it by following it on the local stack, then add scenarios one at a time.

> **Outcome note (2026-10-30).** Built as specified: a template (`template.md`), the first runbook, and a README listing written and planned scenarios. The runbook was followed on the local stack and the run recorded; it found one gap (no operator-visible pending-event count), recorded as register item 96. The open point about seeing the pending count is answered: today there is no way. Changes from the original plan: none to scope; the stuck-entry scenario stays planned because it was not reproduced.

**Context / Why**
A runbook says what to do when something fails. The first one should describe a failure whose behavior is already shown: the event broker (Redis Streams) being down while a customer checks out. The slice-1 work showed that the checkout still succeeds after the 2-second inline publish timeout and that the outbox relay sends the events once Redis returns (`WI-ORD-005`).

**Inputs / References**
- *Decisions*: ADR-0003, `docs/architecture/patterns.md` (section 3 and the failure table)
- *Evidence*: `docs/product/backlog/WI-ORD-005.md` (the outage and recovery run)
- *Operations*: `docs/operations/sla.md`, `docs/operations/monitoring-alerting.md`, `docs/operations/local-dev.md`

**You do not need to know about**
- Deployment: runbooks here are for the local stack until something is deployed.

**Out of scope**
- On-call rotation (`OPS-004`), alert rules (`OBS-003`), and disaster recovery (`BDR-003`).

**Requirements / Acceptance Criteria**
- A runbook template in `docs/operations/runbooks/`: symptom, how it is detected, customer impact, steps, how to verify recovery, what not to do, when to escalate, last tested.
- The first runbook, "Event broker unavailable during checkout", written from the verified behavior.
- It was followed on the local stack (stop Redis, place an order, see the pending event, restart Redis, see it published) and the result recorded in `docs/evidence/` with the date and commands.
- `docs/operations/runbooks/README.md` lists the scenarios, written and planned: cache fallback (ADR-0002, once a service uses the cache), Cosmos throttling (ADR-0004), cold start, identity issuer down, a stuck outbox entry (register 74).
- Anything the run shows that the code does not do (for example no pending-event metric) becomes a register item.

**Dependencies**
- Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes for drafting; the test run must be real and the result recorded.

**Open Points (working)**
- [ ] How an operator sees the number of pending outbox events today (there may be no way yet).
