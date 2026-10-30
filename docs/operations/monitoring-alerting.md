# Monitoring / Alerting Plan

> **Status:** Current as policy · checked 2026-10-30. No threshold below is implemented: there are no dashboards or alert rules, and nothing is deployed to monitor.

**Policy layer, not implementation.** This document states *what* gets monitored and *when* an alert fires. Building the actual Application Insights dashboards and alert rules against these thresholds is `EPIC-OBSERVABILITY`'s job (`OBS-001`/`OBS-002`/`OBS-003`) — this document exists first, so that epic implements against real targets instead of guessing at them. (Note: `epic-catalog.md`'s `OBS-003` entry previously described itself as "feeding" this document — that direction was backwards and has been corrected there.)

Tooling is already decided (`docs/architecture/tech-stack.md`'s Observability row: Application Insights + Azure Monitor) — not re-litigated here.

## Thresholds

Every threshold below is derived from an existing ceiling or target — none are invented fresh. Warning at 70% of a free-tier ceiling, critical at 90%, unless otherwise noted.

| Metric | Warning | Critical | Source ceiling/target |
|---|---|---|---|
| Cosmos DB RU/s (sustained) | 700 RU/s | 900 RU/s | 1,000 RU/s shared ceiling (ADR-0004) |
| Event Grid operations/month | 70,000 | 90,000 | 100,000/month free grant (ADR-0003); current planning estimate is ~42,000/month, a lower bound (`nfrs.md` §1) |
| APIM calls/month | 700,000 | 900,000 | 1,000,000/month free grant (ADR-0008); current planning estimate is ~600,000/month (`nfrs.md` §1) |
| Cache fallback frequency (Redis → local) | any sustained fallback > 5 minutes | any fallback > 30 minutes | ADR-0002's circuit-breaker fallback — a single brief trip is expected/normal, a sustained one is not |
| Browse/search latency (p95) | 400 ms | 500 ms (target breach) | `docs/operations/sla.md`'s latency table |
| Checkout latency (p95) | 1,200 ms | 1,500 ms (target breach) | `docs/operations/sla.md`'s latency table |
| SLA error-budget burn rate | 50% of monthly budget consumed | 90% of monthly budget consumed | ~7.3 hours/month budget (`sla.md`) |

## What happens when a threshold fires

- **Warning-level**: logged and visible on the (future) `EPIC-OBSERVABILITY` dashboard; no immediate escalation required, but worth checking before it becomes critical
- **Critical-level**: triggers the corresponding escalation path in `docs/management/stakeholder-communications-plan.md` — specifically, a critical SLA error-budget burn is exactly the event that plan's "SLA error budget exhausted" trigger is written for; this document is what technically fires that trigger, the comms plan is what happens once it does

## Explicitly out of scope

- **The actual runbook response** to a fired alert — that's `OPS-002` (`docs/operations/runbooks/`), a separate item; this document says *when* to alert, not *what to do* once alerted
- **Dashboard construction/alert rule implementation** — `EPIC-OBSERVABILITY`'s job, using the tooling `tech-stack.md` already named

## Related

- `docs/operations/sla.md` — source of every threshold above
- `docs/management/stakeholder-communications-plan.md` — what happens once a critical threshold fires
- `EPIC-OBSERVABILITY` (`epic-catalog.md`) — implements against these thresholds; does not define them
