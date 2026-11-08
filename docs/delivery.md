# Delivery and project management

> **Status:** Current · written 2026-11-08 as a guide to documents that already exist. Counts are from `STATUS.md`, the open-items register and the git history on that date; the generated pages are the source if they differ.

The project is run the way a small product team would run one, by one lead with AI assistants: a vision and scope that say what is in and out, a roadmap and OKRs, a backlog of specifications with a defined lifecycle, working agreements, a risk register, and a running list of everything found and not fixed. The records are generated or cross-checked where they can be, so they do not drift.

## Product management

| Artifact | What it shows |
|---|---|
| [Vision](product/vision.md), [personas and jobs to be done](product/personas.md) | The problem, the principles, who it is for |
| [Scope](product/scope.md) | Every feature and artifact with its MVP legend and what exists today |
| [Roadmap](product/roadmap.md), [demo milestones](product/demo-milestones.md) | Now, next and later; the original delivery sequence and where it stands |
| [OKRs](product/okrs.md) | Five objectives with key results, each marked **measured today** or **not yet measurable**, a baseline and how it is collected; targets confirmed 2026-11-06 |
| [Competitive scan, monetization, prioritization](product/backlog/STATUS.md) | Proposed specifications (`PROD-002`, `PROD-003`, `PLAN-001`) with the decision each one waits for |

## Planning and the backlog

- **Specifications as the unit of work.** 110 specs in [`product/backlog/`](product/backlog/README.md), each with a status on line 1 (Done 55, In review 30, In progress 5, Deferred 11, Proposed 4, Ready 2, Built 1, Superseded 2). The [status table](product/backlog/STATUS.md) and the [traceability table](product/backlog/TRACEABILITY.md) are generated from the banners and the tests; a gate fails when they are out of date.
- **A lifecycle for every document,** with a vocabulary for status and for superseding a record without rewriting it ([status and supersession](method/status-and-supersession.md), [document lifecycles](method/document-lifecycles.md)). Decisions are ADRs that are amended with dated notes ([23 ADRs](architecture/adr/README.md), [how they changed](architecture/decision-timeline.md)).
- **Plans at two levels:** [the project plan](management/project-plan.md) (eight phases with entry and exit criteria) and [the current plan](product/backlog/current-plan.md) (what is built, in flight and next), with [how the phases actually ran](architecture/decision-timeline.md).
- **Prioritization written down:** the slice-1 backlog has sized, ordered "next" items ([prioritized backlog](management/slice-1/03-prioritized-backlog.md)); the lead's order is the decision, the AI proposes.

## Working agreements

- **Trunk-based, themed branches:** a commit names one work item; a branch and its pull request group a theme; rebase before push ([branching strategy](process/branching-strategy.md)).
- **Definitions of Ready and Done and a verification policy** that says which checks each kind of change carries ([definition of ready](process/definition-of-ready.md), [definition of done](process/definition-of-done.md), [verification policy](process/verification-policy.md), [engineering standards](process/engineering-standards.md)).
- **Quality gates** run before every push and again in the pipeline ([quality gates](process/quality-gates.md); ten pipeline jobs in [`azure-pipelines.yml`](../azure-pipelines.yml)).
- **Approval gates:** security, authorization and IAM changes, and any widening of scope, need the lead's approval first ([`CLAUDE.md`](../CLAUDE.md), [AI collaboration](method/ai-collaboration.md)).
- **Findings are never dropped:** anything found and not fixed goes into the [open-items register](governance/open-items-register.md) in the same change (166 items, each with a status), and what was learned goes into [the lessons](method/lessons.md) (34).

## Risk, governance and communication

[Risk register](management/risk-register.md) (20 risks, each traced to a decision, an evidence record or a register item) · [architecture review and change control](governance/architecture-review.md) · [review statement](governance/review-statement.md) · [stakeholder communications plan](management/stakeholder-communications-plan.md) and [budget](management/budget-cost-estimate.md) (labelled hypothetical: a one-person project) · [SLA/SLO](operations/sla.md), [monitoring plan](operations/monitoring-alerting.md), [runbooks](operations/runbooks/README.md).

## Delivery in numbers

From the git history and the recorded sessions of the AI assistant ([AI collaboration](method/ai-collaboration.md) has the detail and its limits):

| | |
|---|---|
| Calendar span | 2026-09-04 to 2026-11-08, work on 25 days, 428 commits |
| Work items | 110 specs; 85 Done or In review |
| Decisions | 23 ADRs |
| Evidence records | one beside each run, indexed in [evidence](evidence/README.md) |
| Open items | 166 in the register, each with a status |

## Read next

[Roadmap](product/roadmap.md) · [current plan](product/backlog/current-plan.md) · [OKRs](product/okrs.md) · [method](method/README.md) · [testing](testing.md) · [performance and NFRs](performance-and-nfrs.md)
