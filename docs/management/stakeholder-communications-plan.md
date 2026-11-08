# Stakeholder Communications Plan

> **Status:** Hypothetical · a template for how a team would communicate, written for a project that has one lead and no other stakeholders. Re-read on 2026-11-08: the artifacts it names exist, except that the activity log is closed (the register and commit messages carry what it did) and the plan has 8 phases (0 to 7). In practice the lead reads `docs/product/backlog/current-plan.md`, the register and the pull requests.

Role-based, not name-based — `MGMT-006` (team/hiring plan) doesn't exist yet, and this plan doesn't need to wait for it. Cadence and escalation triggers are wired to artifacts that already exist, not invented meeting names.

## Stakeholder roles and what each needs to know

| Role | Needs to know | Cadence |
|---|---|---|
| Executive Sponsor | Phase-level progress, budget status, any risk that's moved to High likelihood/impact | At each phase boundary (`docs/management/project-plan.md`'s 8 phases), plus immediately on an escalation trigger (below) |
| Product Owner | Backlog priority, plan changes, epic completion | Whenever `docs/product/backlog/current-plan.md` changes (already a live artifact), not a separate report |
| Engineering Lead / Architect | New ADRs, architecture-review outcomes, any context-completeness gap surfaced (a surprise, `docs/method/glossary.md`) | As they happen — ADRs and process fixes are self-documenting (the activity log, `docs/history/ACTIVITY-LOG.md`, is closed; the register and commit messages replace it) |
| Operations Lead | SLA error-budget status, any risk-register entry that materializes | Monthly (aligned to the SLA's monthly error-budget window), plus immediately on budget exhaustion |

## Cadence, tied to real checkpoints

- **Phase-boundary review** (per `project-plan.md`): at each phase's exit criteria being met, a short review against that phase's stated objective — not a status theater meeting, an actual check against written exit criteria
- **Monthly risk/SLA review**: `docs/management/risk-register.md` and `docs/operations/sla.md`'s error budget reviewed together monthly, since a risk materializing and an SLA breach are often the same event viewed from two angles
- **Ad hoc, ADR-triggered**: any new or amended ADR (see `docs/architecture/adr/README.md`) is itself a communication event for the Engineering Lead/Architect role — no separate summary needed, the ADR is the artifact

## Escalation triggers — concrete, not vague

- **SLA error budget exhausted** (per `docs/operations/sla.md`'s policy: feature-flag freeze + incident review) → Operations Lead notifies Executive Sponsor and Engineering Lead immediately, not at the next scheduled review
- **A risk-register entry's likelihood or impact increases** (e.g., R-10's schedule risk actually materializing — a phase significantly overrunning its expected relative sequencing) → Product Owner and Executive Sponsor notified, with the specific risk ID cited, not a vague "things are behind"
- **A new "surprise" (the surprise rule, `docs/method/glossary.md`)** that changes a prior architectural decision (like the API Gateway zero-trust discovery, or the bounded-context-to-service mapping gap) → Engineering Lead and Product Owner notified as soon as it's identified, before the fix is even fully drafted — the discovery itself is the signal, not just the resolution

## Explicitly not covered here

- Named individuals — see `MGMT-006` once drafted
- Decision-making authority (who approves what) — that's `MGMT-003` (RACI), a different document with a different job
