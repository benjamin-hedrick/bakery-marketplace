# Runbooks

> **Status:** Current · 2026-11-18 (the parked order and listing outboxes added). A runbook says what to do when something fails. These are for the local stack until something is deployed. Each is written from behaviour that was run, says what was only read in the code, and ends with when it was last tested. Copy [`template.md`](template.md) for a new one. Alerts that would trigger them are not built (`docs/operations/monitoring-alerting.md`).

## Written

| Runbook | Scenario | Last tested |
|---|---|---|
| [`event-broker-unavailable-during-checkout.md`](event-broker-unavailable-during-checkout.md) | Redis Streams is down while customers check out | 2026-10-30, local stack |
| [`parked-order-outbox.md`](parked-order-outbox.md) | An order event cannot be published (not a broker outage) and the order's outbox is parked | 2026-11-18, local stack |
| [`parked-listing-outbox.md`](parked-listing-outbox.md) | A listing event cannot be published (not a broker outage) and the listing's outbox is parked | 2026-11-18, local stack |

## Procedures (Draft: written, not run)

These are not failure scenarios but one-off or repeated operations on the deployed environment (ADR-0020). Each is Current only after it has been run and its "Last tested" says so.

| Procedure | What it is for | Last tested |
|---|---|---|
| [`bootstrap-terraform-state.md`](bootstrap-terraform-state.md) | Create the Terraform state storage and the pipeline identities once, with a verify section | 2026-11-19 (checks 1 to 5); check 6 for `bakery-plan` 2026-11-20 |
| [`prove-the-pipeline-gates.md`](prove-the-pipeline-gates.md) | Prove the approvals, branch check, lock and typed confirmation with a pipeline that only prints | 2026-10-31 to 2026-11-01 (G1 to G8) |
| [`dev-environment-teardown.md`](dev-environment-teardown.md) | Remove everything the dev environment stack created, through the gated destroy | Never (written 2026-11-20, before the first dev apply) |

Still to write, when it first runs: create the dev environment.

## Planned (not written)

| Scenario | Basis | Waiting for |
|---|---|---|
| Cache fallback | ADR-0002, `patterns.md` sections 1 and 14; the outage run of 2026-11-18 (`docs/evidence/dependency-outages-2026-11-18.md`) | The behaviour is recorded; the procedure is to write, and the stall and the warning per call (register 205) may change what it says |
| Cosmos throttling | ADR-0004 | Something to throttle: not exercised on the emulator |
| Cold start | the 9 s cold first call in `docs/evidence/runbook-event-broker-2026-10-30.md` and `baseline-2026-10-30.md` | A deployed environment |
| Identity issuer down | `patterns.md` section 14; the outage run of 2026-11-18 (`docs/evidence/dependency-outages-2026-11-18.md`) | The local behaviour is recorded (register 204 for the restart); the real issuer is Entra ID, so the procedure waits for the deployed environment |
| Cosmos unavailable | `patterns.md` section 14; the outage run of 2026-11-18 | The emulator's behaviour is recorded (register 206); a real account, its failover and throttling are not |
| Catalog unavailable during checkout | `patterns.md` section 14 (`503 downstream_unavailable`, shown as `TEMPORARILY_UNAVAILABLE`; the `catalog-outage` chaos scenario, register 165) | A run with the catalog process stopped |

Disaster recovery is `BDR-003` and on-call is `OPS-004`; neither is started.
