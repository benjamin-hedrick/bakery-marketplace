# Runbooks

> **Status:** Current · 2026-10-30. A runbook says what to do when something fails. These are for the local stack until something is deployed. Each is written from behaviour that was run, says what was only read in the code, and ends with when it was last tested. Copy [`template.md`](template.md) for a new one. Alerts that would trigger them are not built (`docs/operations/monitoring-alerting.md`).

## Written

| Runbook | Scenario | Last tested |
|---|---|---|
| [`event-broker-unavailable-during-checkout.md`](event-broker-unavailable-during-checkout.md) | Redis Streams is down while customers check out | 2026-10-30, local stack |

## Procedures (Draft: written, not run)

These are not failure scenarios but one-off or repeated operations on the deployed environment (ADR-0020). Each is Current only after it has been run and its "Last tested" says so.

| Procedure | What it is for | Last tested |
|---|---|---|
| [`bootstrap-terraform-state.md`](bootstrap-terraform-state.md) | Create the Terraform state storage and the pipeline identities once, with a verify section | Never |
| [`prove-the-pipeline-gates.md`](prove-the-pipeline-gates.md) | Prove the approvals, branch check, lock and typed confirmation with a pipeline that only prints | Never |

Still to write, when each step first runs: create the dev environment, tear it down.

## Planned (not written)

| Scenario | Basis | Waiting for |
|---|---|---|
| A stuck outbox entry | register item 74 | A reproduction (an unpublishable event) |
| Cache fallback | ADR-0002, `patterns.md` section 1 | The catalog now uses the cache (`WI-CAT-003`); a written procedure for a cache outage is still to do |
| Cosmos throttling | ADR-0004 | Something to throttle: not exercised on the emulator |
| Cold start | the 9 s cold first call in `docs/evidence/runbook-event-broker-2026-10-30.md` and `baseline-2026-10-30.md` | A deployed environment |
| Identity issuer down | `patterns.md` section 14 ("behaviour with the issuer down is not examined") | A run with the issuer stopped |
| Catalog unavailable during checkout | `patterns.md` section 14 (`503 downstream_unavailable`) | A run with the catalog stopped |

Disaster recovery is `BDR-003` and on-call is `OPS-004`; neither is started.
