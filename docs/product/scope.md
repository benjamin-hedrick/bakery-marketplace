# Scope: features and artifacts, and where each stands

> **Status:** Current · written 2026-10-30. Moved from the repository's original `portfolio-plan.md` (September 2026, now in `docs/history/portfolio-plan-2026-09.md`): the scope decisions and the MVP legend are the original's; the "State" columns are new and say what exists in the repository on this date. "Built" means built and run locally. Nothing is deployed.

A pickup-based marketplace connecting customers with local bakeries and coffee shops and with independent or homemade vendors, with dietary preference matching, order customization, a live order-queue display and sponsored placement in search. Designed so delivery and dispatch can be added without building them in v1. The project exists to show end-to-end ownership across architecture, engineering lead, product, digital product management, operations and platform roles.

The status of each work item, including the artifacts below that are deferred or proposed, is in [`STATUS.md`](backlog/STATUS.md); what is built and next is [`current-plan.md`](backlog/current-plan.md).

## Legend

- **[MVP]** built for real in v1.
- **[MVP-lite]** built, but a deliberately minimal version.
- **[Deferred]** documented (an ADR or a one-pager) but not built.
- **[Post-launch]** after go-live.

State words: **Built** (runs locally), **Partly**, **Stub** (a named stand-in), **Not started**, **Deferred**.

## Domain features

| Feature | Scope | State (2026-10-30) | Notes |
|---|---|---|---|
| Catalog and listings, including coffee and bakery customization | MVP | Built | Listings, options, allergy flags, stock (`catalog-service`) |
| Search and discovery, dietary filtering | MVP | Not started | `SRCH-001` is Ready |
| Sponsored placement mixed into search | MVP-lite | Not started | A simple flag; no bidding engine |
| Ordering and checkout with scheduled pickup windows | MVP | Built | Checkout, idempotency, pickup windows, stock reservation (`ordering-service`) |
| Order lifecycle and live order-queue display | MVP | Partly | The lifecycle and its events are built; the read model and the queue display are not (`QUE-001`, `QUE-002`) |
| Customer preferences and dietary constraints | MVP | Not started | `PREF-001`, `PREF-002`, `CUST-005`, `CUST-006` are Ready |
| Vendor onboarding and verification | MVP | Stub | Vendors are seeded and marked verified by an event the seed script publishes (`VEN-001`, `VEN-002` are Ready) |
| Notifications and background processing | MVP | Not started | `notification-service` is an empty scaffold |
| Admin and moderation console | MVP-lite | Not started | `admin-service` is an empty scaffold |
| Payments and vendor payouts | MVP-lite | Stub | A named stub approves every payment; no Stripe code |
| Reviews and trust | MVP-lite | Not started | |
| Full ad platform (bidding, ad analytics) | Deferred | Deferred | ADR only |
| Delivery and dispatch (courier, ETA, cold chain) | Deferred | Deferred | The fulfillment seam is built (ADR-0001); `PickupFulfillment` is not |
| B2B small-supplier flow | Deferred | Deferred | Scoped out in the domain glossary |
| Full multi-region scale and disaster recovery | Deferred | Deferred | Named in the NFRs |

## Artifacts by role

**Architect**

| Artifact | Scope | State |
|---|---|---|
| Vision one-pager | MVP | Done: [vision](vision.md) |
| Capability map | MVP | Done: [capability map](../architecture/capability-map.md) |
| Bounded context map, glossary, event-storming output | MVP | Done: [DDD](../architecture/ddd/README.md) |
| C4 diagrams: context, container, components for one or two services | MVP | Done: [C4](../architecture/c4/README.md) |
| Data model and API contracts | MVP | Done: [contracts](../architecture/data-model-api-contracts.md); no OpenAPI for the services |
| NFRs | MVP | Done: [NFRs](../architecture/nfrs.md) |
| Key ADRs | MVP | Done: 18 [ADRs](../architecture/adr/README.md) and a [timeline](../architecture/decision-timeline.md) |
| Multi-region and scale architecture | Deferred | Not written |

**Manager and lead**

| Artifact | Scope | State |
|---|---|---|
| Project plan and phased roadmap | MVP | Done: [project plan](../management/project-plan.md), [roadmap](roadmap.md) |
| Risk register | MVP | Done: [risk register](../management/risk-register.md) |
| RACI (hypothetical team) | MVP | Deferred: [`WI-MGMT-003`](backlog/WI-MGMT-003.md) |
| Engineering standards, definition of done, onboarding | MVP | Done: [standards](../process/engineering-standards.md), [DoD](../process/definition-of-done.md) |
| Budget and cost estimate | MVP-lite | Done as a September snapshot: [budget](../management/budget-cost-estimate.md) |
| Hypothetical team structure and hiring plan | MVP-lite | Deferred: [`WI-MGMT-006`](backlog/WI-MGMT-006.md) |
| Stakeholder communications plan | MVP-lite | Done: [plan](../management/stakeholder-communications-plan.md) |

**Product owner**

| Artifact | Scope | State |
|---|---|---|
| Backlog: epics, work items, acceptance criteria | MVP | Done: [catalog](backlog/epic-catalog.md), 67 [specs](backlog/STATUS.md) |
| Prioritization (MoSCoW or RICE) | MVP | Partly: the MVP legend above and the sized, prioritized list in [slice 1's backlog](../management/slice-1/03-prioritized-backlog.md); the pass is proposed: [`WI-PLAN-001`](backlog/WI-PLAN-001.md) |
| Sprint plan (first 2 to 3 sprints) | MVP | Deferred, by decision on 2026-10-30 (iterative work, no sprint boundaries): [`WI-PLAN-002`](backlog/WI-PLAN-002.md). The slice 1 [plan and critical path](../management/slice-1/02-plan-and-critical-path.md) served instead |
| Definition of ready | MVP | Done: [DoR](../process/definition-of-ready.md) |

**Digital product manager**

| Artifact | Scope | State |
|---|---|---|
| Personas and jobs to be done | MVP | Done: [personas](personas.md) |
| Competitive scan | MVP-lite | Proposed: [`WI-PROD-002`](backlog/WI-PROD-002.md) |
| Monetization model | MVP-lite | Proposed: [`WI-PROD-003`](backlog/WI-PROD-003.md) |
| Success metrics and OKRs | MVP | In review: [`WI-PROD-004`](backlog/WI-PROD-004.md); [OKRs](okrs.md) first version written, targets for the lead to set |

**Operations and SRE**

| Artifact | Scope | State |
|---|---|---|
| SLA/SLO | MVP | Done as targets, none measured: [SLA](../operations/sla.md) |
| Runbook | MVP-lite | Built: [`WI-OPS-002`](backlog/WI-OPS-002.md); one runbook (event broker unavailable during checkout), tested locally; more scenarios planned |
| Monitoring and alerting plan | MVP-lite | Done as policy, not implemented: [plan](../operations/monitoring-alerting.md) |
| Staged incident postmortem | Post-launch | Proposed: [`WI-LAUNCH-002`](backlog/WI-LAUNCH-002.md); [test reliability](../evidence/test-reliability/findings.md) is the nearest record |
| On-call rotation | Deferred | Not written |

**Platform engineering**

| Artifact | Scope | State |
|---|---|---|
| Local development environment (compose and seed data) | MVP | Done and verified: [local development](../operations/local-dev.md) |
| Configuration management and a feature-flag pattern | MVP | Partly: environment configuration is built; no feature flags exist |
| Caching | MVP | Partly: the library is built and unused by any service |
| Reusable tooling (event schemas, logging and correlation helper) | MVP | Done: `tools/` |
| Ephemeral or preview environments | MVP-lite | Not started |
| Branching and release strategy, dependency and versioning policy | MVP | Partly: [branching](../process/branching-strategy.md) covers branches and versioning; no dependency policy |

**Governance**

| Artifact | Scope | State |
|---|---|---|
| Architecture review and change management | MVP-lite | Done: [architecture review](../governance/architecture-review.md) |

**Engineering and build**

| Artifact | Scope | State |
|---|---|---|
| Working services for the MVP feature set | MVP | Partly: `catalog-service` and `ordering-service`; two services are scaffolds |
| Tests and CI/CD pipeline | MVP | Partly: tests and an Azure Pipelines build and test baseline; no CD |
| Docs site published | MVP | Not published: the MkDocs configuration exists |
| Narrative top-level README | MVP | Done: the repository's `README.md` |
| GitHub Projects board as public roadmap | MVP | Not created (register item 12) |
