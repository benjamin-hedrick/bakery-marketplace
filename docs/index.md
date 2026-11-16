# Bakery/Coffee Marketplace — documentation

> **Status:** Current · rewritten 2026-10-30, refreshed 2026-11-08, reorganized 2026-11-16 (a short route first, the full map after it). This page replaced `project-log.md` as the map of what exists and where.

A pickup-based bakery and coffee marketplace, built as a reference project: to practise and experiment with architecture, product and delivery, and with building software alongside an AI assistant. It runs locally; nothing is deployed. Do not read a document here as proof that something works unless it points to a run; the evidence is linked from each page.

## Start here

| You want | Go to |
|---|---|
| To see it running | [The demo film](operations/demo/demo-film.mp4) ([how it was made](operations/demo-film.md)) |
| Why it is shaped this way | [Architecture decisions](architecture/adr/README.md) and [the container diagram](architecture/c4/container.md) |
| How it is tested, including faults injected on purpose | [Testing](testing.md) |
| How it performs and what happens when a dependency fails | [Performance, scalability and NFRs](performance-and-nfrs.md) |
| How the work is planned, tracked and governed | [Delivery and project management](delivery.md) |
| How the AI assistant was used, what went wrong and what caught it | [AI collaboration](method/ai-collaboration.md) |
| What is built and what is next | [Current plan](product/backlog/current-plan.md) |

## Reference

| You want | Go to |
|---|---|
| The status of every work item, epic and ADR | [Status](product/backlog/STATUS.md) (generated) |
| How the decisions changed over time | [Decision timeline](architecture/decision-timeline.md), [C4 diagrams](architecture/c4/README.md), [domain model](architecture/ddd/README.md) |
| Patterns used (adapters, outbox, idempotency, reserve and release) and what happens when a dependency fails | [Patterns](architecture/patterns.md) |
| One request through the system | [Request path](architecture/request-path.md) |
| Fault injection: the scenarios and how to run them | [Chaos scenarios](../chaos/README.md), [ADR-0024](architecture/adr/0024-chaos-scenarios.md), [the runs](evidence/WI-CHAOS-003/README.md) |
| The first slice's contract and how it ended up | [First-slice contract](architecture/first-slice-contract.md), [order lifecycle](architecture/order-lifecycle.md) |
| Every run and measurement | [Evidence index](evidence/README.md) |
| How to run it on a laptop | [Local development](operations/local-dev.md), [demo](operations/demo.md), [every script and command](operations/scripts.md) |
| How work is specified and tracked | [Method](method/README.md), [engineering standards](process/engineering-standards.md), [definition of done](process/definition-of-done.md), [quality gates](process/quality-gates.md) |
| How tests are written and reviewed | [Test strategy](process/test-strategy.md), [Playwright guide](process/playwright-guide.md), [test-review checklist](process/test-review-checklist.md) |
| Quality targets and operations | [NFRs](architecture/nfrs.md), [SLA](operations/sla.md), [monitoring plan](operations/monitoring-alerting.md), [runbooks](operations/runbooks/README.md) |
| Product intent and scope | [Vision](product/vision.md), [personas](product/personas.md), [scope](product/scope.md), [roadmap](product/roadmap.md), [OKRs](product/okrs.md) |
| Plans and risks | [Project plan](management/project-plan.md), [risk register](management/risk-register.md) |
| Open problems and trade-offs | [Open-items register](governance/open-items-register.md) |
| The epics and their planned items | [Epic catalog](product/backlog/epic-catalog.md) |
| Earlier plans, reviews and logs | [History](history/README.md) |

Records written during the work (specs, the register, evidence, lessons and history) call the author "the lead", the role the author played with the AI assistant.
