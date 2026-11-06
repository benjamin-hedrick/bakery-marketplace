# Bakery/Coffee Marketplace — Portfolio Docs

> **Status:** Current · rewritten 2026-10-30, refreshed 2026-11-05. This page replaced `project-log.md` as the map of what exists and where.

A pickup-based bakery and coffee marketplace, built to show architecture, product and engineering ownership. Slice 1 (login, browse with stock, cart, test checkout, order status) and the work since (live vendor queue, notifications, order history, allergen profiles, an Android app) run locally; nothing is deployed. Do not read a document here as proof that something works unless it points to a run; see the evidence below.

## Where things are

| You want | Go to |
|---|---|
| What is built and what is next | [Current plan](product/backlog/current-plan.md) |
| The status of every work item, epic and ADR | [Status](product/backlog/STATUS.md) (generated) |
| Why it is shaped this way | [ADRs](architecture/adr/README.md), [decision timeline and how the phases ran](architecture/decision-timeline.md), [C4 diagrams](architecture/c4/README.md), [domain model](architecture/ddd/README.md) |
| Patterns used (adapters, outbox, idempotency, reserve and release) and what happens when a dependency fails | [Patterns](architecture/patterns.md) |
| What runs, and one request through it | [Container diagram](architecture/c4/container.md), [request path](architecture/request-path.md) |
| The first slice's contract and how it ended up | [First-slice contract](architecture/first-slice-contract.md), [order lifecycle](architecture/order-lifecycle.md) |
| What was run and what happened | [Slice 1 findings](evidence/slice-1/findings.md), [test reliability](evidence/test-reliability/findings.md), [evidence baseline](evidence/baseline-2026-10-30.md) |
| How to run it on a laptop | [Local development](operations/local-dev.md) |
| How to show it (one command, a checklist, screenshots) | [Demo](operations/demo.md) |
| Every script and command | [Scripts](operations/scripts.md) |
| How work is specified and tracked | [Method](method/README.md), [engineering standards](process/engineering-standards.md), [definition of done](process/definition-of-done.md), [quality gates](process/quality-gates.md) |
| How it is tested | [Test strategy](process/test-strategy.md), [Playwright guide](process/playwright-guide.md), [test-review checklist](process/test-review-checklist.md) |
| Quality targets and operations | [NFRs](architecture/nfrs.md), [SLA](operations/sla.md), [monitoring plan](operations/monitoring-alerting.md) |
| Product intent and scope | [Vision](product/vision.md), [personas](product/personas.md), [scope](product/scope.md), [roadmap](product/roadmap.md), [demo milestones](product/demo-milestones.md) |
| Plans and risks | [Project plan](management/project-plan.md), [risk register](management/risk-register.md), [slice 1 plan](management/slice-1/02-plan-and-critical-path.md) |
| Open problems and trade-offs | [Open-items register](governance/open-items-register.md) |
| The epics and their planned items | [Epic catalog](product/backlog/epic-catalog.md) |
| Earlier plans and logs | [History](history/README.md) |
