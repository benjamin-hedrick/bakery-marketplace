# Delivery and project management

> **Status:** Current · written 2026-11-08 as a guide to documents that already exist, revised 2026-11-16 (counts removed: each lives in the one record that generates or holds it, linked below).

The project is run the way a small product team would run one, by one person (me) with an AI assistant: a vision and scope that say what is in and out, a roadmap and OKRs, a backlog of specifications with a defined lifecycle, working agreements, a risk register, and a running list of everything found and not fixed. The records are generated or cross-checked where they can be, so they do not drift.

## Product management

| Artifact | What it shows |
|---|---|
| [Vision](product/vision.md), [personas and jobs to be done](product/personas.md) | The problem, the principles, who it is for |
| [Scope](product/scope.md) | Every feature and artifact with its MVP legend and what exists today |
| [Roadmap](product/roadmap.md), [demo milestones](product/demo-milestones.md) | Now, next and later; the original delivery sequence and where it stands |
| [OKRs](product/okrs.md) | Objectives with key results, each marked **measured today** or **not yet measurable**, a baseline and how it is collected |
| [Competitive scan, monetization, prioritization](product/backlog/STATUS.md) | Proposed specifications (`PROD-002`, `PROD-003`, `PLAN-001`) with the decision each one waits for |

## Planning and the backlog

- **Specifications as the unit of work** in [`product/backlog/`](product/backlog/README.md), each with a status on line 1. The [status table](product/backlog/STATUS.md) and the [traceability table](product/backlog/TRACEABILITY.md) are generated from the banners and the tests; a gate fails when they are out of date.
- **A lifecycle for every document,** with a vocabulary for status and for superseding a record without rewriting it ([status and supersession](method/status-and-supersession.md), [document lifecycles](method/document-lifecycles.md)). Decisions are ADRs that are amended with dated notes ([the ADRs](architecture/adr/README.md), [how they changed](architecture/decision-timeline.md)).
- **Plans at two levels:** [the project plan](management/project-plan.md) (phases with entry and exit criteria) and [the current plan](product/backlog/current-plan.md) (what is built, in flight and next), with [how the phases actually ran](architecture/decision-timeline.md).
- **Prioritization written down:** the slice-1 backlog has sized, ordered "next" items ([prioritized backlog](management/slice-1/03-prioritized-backlog.md)); I decide the order and the assistant proposes.

## Working agreements

- **Trunk-based, themed branches:** a commit names one work item; a branch and its pull request group a theme; rebase before push ([branching strategy](process/branching-strategy.md)).
- **Definitions of Ready and Done and a verification policy** that says which checks each kind of change carries ([definition of ready](process/definition-of-ready.md), [definition of done](process/definition-of-done.md), [verification policy](process/verification-policy.md), [engineering standards](process/engineering-standards.md)).
- **Quality gates** run before every push and again in the pipeline ([quality gates](process/quality-gates.md), [`azure-pipelines.yml`](../azure-pipelines.yml)); a ruleset on `main` makes the pipeline's checks required for a pull request.
- **Approval gates:** security, authorization and IAM changes, and any widening of scope, need my approval first ([`CLAUDE.md`](../CLAUDE.md), [AI collaboration](method/ai-collaboration.md)).
- **Findings are never dropped:** anything found and not fixed goes into the [open-items register](governance/open-items-register.md) in the same change, each item with a status, and what was learned goes into [the lessons](method/lessons.md).

## Risk, governance and communication

[Risk register](management/risk-register.md) (each risk traced to a decision, an evidence record or a register item) · [architecture review and change control](governance/architecture-review.md) · [review statement](governance/review-statement.md) · [stakeholder communications plan](management/stakeholder-communications-plan.md) and [budget](management/budget-cost-estimate.md) (labelled hypothetical: a one-person project) · [SLA/SLO](operations/sla.md), [monitoring plan](operations/monitoring-alerting.md), [runbooks](operations/runbooks/README.md).

## The delivery record

- **What was built and when:** the git history (every commit names its work item) and the [decision timeline](architecture/decision-timeline.md).
- **Where every work item stands:** [`STATUS.md`](product/backlog/STATUS.md), generated.
- **What each AI session cost, relative to the others:** the table in [AI collaboration](method/ai-collaboration.md#what-the-sessions-cost), the one place those figures are kept.
- **Every run and measurement:** the [evidence index](evidence/README.md).

## Read next

[Roadmap](product/roadmap.md) · [current plan](product/backlog/current-plan.md) · [OKRs](product/okrs.md) · [method](method/README.md) · [testing](testing.md) · [performance and NFRs](performance-and-nfrs.md)
