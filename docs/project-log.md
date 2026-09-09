# Project Log — Artifact Index

Every analysis step, decision, and artifact produced for this project, in one place, with status and a one-line description. This is implementation-specific — for the *general* practice behind an item, see the cross-references to `project-process-framework` and `ai-collaboration-playbook` (separate repos).

Legend: ✅ Done · 🟡 Stub (exists, not fleshed out) · ⬜ Planned, not started

## Planning & Vision

| Artifact | Path | Status | Description | Cross-reference |
|---|---|---|---|---|
| Portfolio Plan | `portfolio-plan.md` | ✅ | Full scope, MVP-line legend, artifact list by role, delivery sequence | *process:* core Phase 7 shape |
| Vision One-Pager | `docs/product/vision.md` | ✅ | Problem, audience, value prop, guiding principles, explicit out-of-scope list | *process:* core Phase 3 |
| Personas / JTBD | `docs/product/personas.md` | ✅ | Full personas (goals/pain points/JTBD) for all 4 glossary actors, each connected to a specific product decision | *process:* core Phase 3 |
| OKRs / Success Metrics | `docs/product/okrs.md` | 🟡 | North-star safety metric named in vision; not formalized | — |
| Roadmap | `docs/product/roadmap.md` | 🟡 | Points back to this log and the plan; not yet a live-tracked roadmap | — |

## Domain Modeling

| Artifact | Path | Status | Description | Cross-reference |
|---|---|---|---|---|
| Bounded Context Map | `docs/architecture/ddd/bounded-contexts.md` | ✅ | Core/supporting/generic classification, Mermaid context map, named integration patterns | *process:* core Phase 4; *domain:* `domains/software-systems` (DDD instantiation) |
| Glossary | `docs/architecture/ddd/glossary.md` | ✅ | Ubiquitous language, incl. explicit scoped-out B2B-supplier entry; updated with 4 events surfaced by event-storming | *process:* core Phase 4 (glossary discipline) |
| Event Storming Output | `docs/architecture/ddd/event-storming.md` | ✅ Done | 4 process flows, Command→Aggregate→Event→Policy→Read Model; surfaced 4 previously-unnamed real events | — |

## Architecture Decision Records

| ADR | Status | Decision | Pattern used |
|---|---|---|---|
| [0001 — Fulfillment Strategy Extensibility](architecture/adr/0001-fulfillment-strategy-extensibility.md) | ✅ Accepted | Pickup v1; delivery deferred behind an Anticorruption Layer | ACL-for-deferred-scope |
| [0002 — Cache Strategy](architecture/adr/0002-cache-strategy.md) | ✅ Accepted | Environment-conditional managed Redis, local fallback | Adapter + fallback + chaos |
| [0003 — Event-Driven Backbone](architecture/adr/0003-event-driven-backbone.md) | ✅ Accepted | Event Grid (cloud) / Redis Streams (local), at-least-once + per-aggregate sequencing | Adapter + contract tests + chaos |
| [0004 — Data Store Choice](architecture/adr/0004-data-store-choice.md) | ✅ Accepted | Cosmos DB, container-per-bounded-context, accepted shared-account tradeoffs | Isolate-in-code, allow-split-later |
| [0005 — Payments Buy-vs-Build](architecture/adr/0005-payments-buy-vs-build.md) | ✅ Accepted | Stripe Connect (Express accounts) | Buy-vs-build reasoning shape |
| [0006 — Auth/Authz Model](architecture/adr/0006-auth-authz-model.md) | ✅ Accepted | Azure AD B2C; role + resource-ownership authorization | Deliberately outside adapter/chaos pattern |
| [0007 — Secrets Management](architecture/adr/0007-secrets-management.md) | ✅ Accepted | Key Vault + managed identity | Eliminate-the-secret-before-managing-it |
| [0008 — API Gateway](architecture/adr/0008-api-gateway.md) | ✅ Accepted | Azure API Management (Consumption), zero-trust dual validation | Explicit departure from the adapter/chaos pattern, with a stated reason |
| [0009 — Bounded-Context-to-Service Mapping](architecture/adr/0009-bounded-context-service-mapping.md) | ✅ Accepted | 13 bounded contexts grouped onto the 4 existing services | Modular monolith — same "isolate in code, split later" posture as ADR-0001/0004 |

All nine are cross-referenced in `architecture/adr/README.md`. General ADR discipline (state-assumptions-first, pattern-reuse-or-name-deviation, periodic audits) is documented in `project-process-framework/domains/software-systems/adr-template.md` — this repo is where that discipline was actually exercised.

## Reference Documents

| Artifact | Path | Status | Description |
|---|---|---|---|
| Tech Stack Overview | `docs/architecture/tech-stack.md` | ✅, actively maintained | Cloud + local stack, confirmed-vs-open status per concern; re-audited after every ADR |
| NFRs Doc | `docs/architecture/nfrs.md` | ✅ Done | Full content — scalability (50 concurrent users / 200 orders/day target), availability (99.0% self-imposed target), security (zero trust/CSRF/injection/secrets/sensitive data), compliance, reliability, extensibility, aspirational/future |
| Capability Map | `docs/architecture/capability-map.md` | ✅ Done | Business-facing re-grouping of bounded contexts into 5 capability domains, consistent with ADR-0009's service mapping and `personas.md` |
| Data Model / API Contracts | `docs/architecture/data-model-api-contracts.md` | ✅ Done | Per-service Cosmos shapes, events, API endpoints; resolved event-dedupe store location (CacheProvider), made the ADR-0004 read-model split concrete, and corrected with the 4 events event-storming surfaced |
| C4 Diagrams | `docs/architecture/c4/` | ✅ Done | Context + container diagrams complete; container diagram's bounded-context-to-service mapping formalized as ADR-0009 |
| Open Items Register | `docs/governance/open-items-register.md` | ✅, active | Staging area for GitHub Issues; shrinks as items get triaged |

## Manager/Lead Artifacts

| Artifact | Path | Status |
|---|---|---|
| Project Plan (execution-level) | `docs/management/project-plan.md` | 🟡 In Review — 8 phases, current-status marker; 1 open decision (relative vs. calendar-date phasing) |
| Risk Register | `docs/management/risk-register.md` | 🟡 In Review — 11 entries incl. chargebacks (Open Item #6) and a new PM-level schedule risk; 1 open decision (confirm ratings) |
| RACI | *(not yet created)* | ⬜ |
| Engineering Standards (PR guidelines, onboarding) | `docs/process/engineering-standards.md` | ✅ Done — PR/review guidelines, onboarding path, secure-coding baseline |
| Budget/Cost Estimate | `docs/management/budget-cost-estimate.md` | 🟡 In Review — ~$0-32/month, driven entirely by Redis tier; 1 open decision (labor/time cost, deliberately not invented) |
| Team/Hiring Plan | *(not yet created)* | ⬜ |
| Stakeholder Comms Plan | `docs/management/stakeholder-communications-plan.md` | ✅ Done — role-based, cadence tied to SLA/risk-register/project-plan checkpoints, not invented meetings |

## Product Owner Artifacts

| Artifact | Status | Description |
|---|---|---|
| Backlog (epics/stories/acceptance criteria) | 🟡 Started | `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md` — 33 epics, high-level work-item titles across every hat, plus a rough suggested build order; 2 items fully detailed as validation examples |
| Prioritization (MoSCoW/RICE) | ⬜ Planned | Draws the story-level MVP line |
| Sprint Plan | ⬜ Planned | |
| Definition of Ready | `docs/process/definition-of-ready.md` ✅ | Real content — gates a work item into Ready status |
| Definition of Done | `docs/process/definition-of-done.md` ✅ | Real content — referenced by every work item rather than restated |
| **Work-item template** | ✅ **Done** | `project-process-framework/templates/work-item-template.md` (separate repo) — Epic + Work Item shape with type-specific sections; validated against 2 real examples below |
| EPIC-CACHING | `docs/product/backlog/EPIC-CACHING.md` 🟡 | Validation example; 1 of 5 constituent items drafted |
| WI-CACHE-001 | `docs/product/backlog/WI-CACHE-001.md` ✅ Ready | Interface/Contract-type validation example, derived from ADR-0002 |
| WI-NFR-001 | `docs/product/backlog/WI-NFR-001.md` ✅ Done | Document complete (see NFRs Doc row above) |
| PARKING-LOT | `docs/product/backlog/PARKING-LOT.md` ✅ Active | Transient, per `project-process-framework/templates/parking-lot-template.md` — distinct from the permanent open-items register |

## Operations/SRE Artifacts

| Artifact | Path | Status |
|---|---|---|
| SLA/SLO | `docs/operations/sla.md` | ✅ Done — 99.0% monthly target (self-imposed, no Azure SLA at this tier), error budget policy, latency targets, known failure modes, all traced to `nfrs.md`/ADRs |
| Runbooks | `docs/operations/runbooks/` | 🟡 Empty, no real scenario written yet |
| Monitoring/Alerting Plan | `docs/operations/monitoring-alerting.md` | ✅ Done — thresholds for every free-tier ceiling + SLA error-budget burn rate, all traced; policy layer only, `EPIC-OBSERVABILITY` implements against it |
| On-Call Pattern Doc | *(not yet created)* | ⬜ Hypothetical, planned |
| Incident Postmortem | *(not yet created)* | ⬜ Post-launch |

## Platform Engineering / DevEx

| Artifact | Path | Status |
|---|---|---|
| `docker-compose.yml` | repo root | 🟡 Stub — needs Redis Streams, Cosmos emulator, cache profile, Stripe CLI wiring, seed data (Open Item #10) |
| Reusable tooling (`/tools`) | `tools/event-schemas`, `tools/logging-helper` | 🟡 Scaffolded, empty; `/tools/auth-middleware` and fault-injection harness not yet created (Open Item #11) |
| Branching/Release Strategy | `docs/process/branching-strategy.md` | ✅ Done — trunk-based + feature flags, repo-wide versioning; surfaced API/URL versioning via APIM as a new open item |
| CI Workflow | `.github/workflows/ci.yml` | 🟡 Placeholder only (Open Item #14) |
| Ephemeral/Preview Environments | *(not yet created)* | ⬜ (Open Item #15) |

## Governance

| Artifact | Path | Status |
|---|---|---|
| Architecture Review Note | `docs/governance/architecture-review.md` | ✅ Done — ADR lifecycle, amend-vs-supersede precedent, audit cadence; explicitly distinguished from `discovery/README.md`'s separate scope |
| Open Items Register | `docs/governance/open-items-register.md` | ✅ Active |
| Activity Log | `docs/ACTIVITY-LOG.md` | ✅ Active — reverse-chronological, distinct from this index |
| Parking Lot | `docs/product/backlog/PARKING-LOT.md` | ✅ Active — transient, per-conversation items |

## Engineering/Build

| Artifact | Status |
|---|---|
| Working services (catalog/ordering/notification/admin) | ⬜ Not started |
| Tests + real CI/CD | ⬜ Not started |
| Docs site published (GitHub Pages) | ⬜ `mkdocs.yml` ready, publish step not run (Open Item #13) |
| GitHub Projects board | ⬜ Not created (Open Item #12) |

---

*This log is a snapshot, not automated — update it when a new artifact is created or a stub gets filled in. If it drifts from the repo's actual state, trust the repo and fix this file, not the other way around.*
