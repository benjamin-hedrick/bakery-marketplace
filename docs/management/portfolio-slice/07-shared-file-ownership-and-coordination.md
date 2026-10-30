# Shared-file ownership and coordination plan

> **Status:** Adopted plan, in force · checked 2026-10-30. The named-owner table below is superseded by `09`: this is a solo-led project, so the lead is the integrator for every shared area. The rule that matters in practice is the shared-file one: one branch at a time edits the register, the spec banners that feed `STATUS.md`, `epic-catalog.md`, `mkdocs.yml`, `CLAUDE.md`, the pipeline YAML and the GraphQL schema (`docs/process/branching-strategy.md`).

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## What “one owner” means

“One owner” means one person/agent is **accountable for integrating and delivering a bounded work item**: resolving in-scope questions, maintaining its status, ensuring tests/evidence exist, and producing the handoff. It does **not** mean that person must do all design, coding, testing, and review alone. Contributors can design, implement subparts, challenge assumptions, and review. The accountable owner coordinates the whole outcome and makes sure no gap falls between parallel tasks.

For high-impact decisions, the owner recommends; the human project lead approves. Agents must not silently make scope-changing architecture or business-policy decisions.

## Work-item ownership vs shared-file ownership

- **Work-item owner:** accountable for the complete acceptance criteria and final handoff.
- **Shared-file editor/merge owner:** controls integration for files likely to conflict across tasks (root package manifest/lockfile, GraphQL schema/codegen config, shared API contract, solution/project files, common test configuration, pipeline YAML, central architecture/index docs).
- **Reviewer/approver:** checks correctness and policy; can be different from both owners.

A work item may have several contributors, but shared files need a single merge path at a time. Do not let two agents independently rewrite the same schema, lockfile, root config, or central document in parallel.

## Initial ownership map (assign named people/agents before launch)

| Area | Accountable integration owner | Parallel contributors allowed? | Coordination rule |
|---|---|---|---|
| ADR adoption and existing-doc reconciliation | One architecture/documentation integrator | Yes, reviewers can inspect specific docs | Integrator maintains one register and consolidates proposals; no unapproved edits |
| GraphQL schema, Relay compiler/codegen config | One contract/schema owner | Frontend and BFF agents may propose changes | Schema owner merges changes; schema changes require regenerated artifacts and tests |
| Root frontend package manifest and lockfile | One frontend integration owner | Feature agents can submit dependency requests | One dependency/lockfile change at a time; clean install/build after merge |
| C# service contracts and shared domain/event types | One contract integrator; service owners own service implementation | Catalog/ordering contributors may work in separate service directories | Changes to shared contract require explicit review and cross-service tests |
| CI/CD pipeline YAML and required checks | One delivery-pipeline owner | Test/build agents can provide commands and checks | No concurrent pipeline edits; keep existing GitHub workflow until ADO checks are proven/migrated |
| OpenTelemetry naming/propagation conventions | One observability integrator | Service agents instrument their own service | Shared naming/propagation conventions reviewed once; service-specific spans can be parallel |
| Central plans, indexes, evidence log | One documentation integrator | Contributors submit handoff notes | Integrator consolidates; avoid competing edits to the same central file |

## Coordination cadence and handoff

Each task packet must include: ID, objective, authoritative inputs, allowed files, excluded files, dependencies, acceptance criteria, required commands/evidence, unresolved questions, stop conditions, and handoff format. The owner reports files changed, tests run/results, decisions made, deviations, open questions, and next dependency. A task ends with a reviewable patch/branch/PR; do not report completion based only on a narrative.

Parallelize isolated work where file ownership and interfaces permit. Serialize work when tasks touch the same shared file or unresolved contract. The human lead remains the final authority for accepted architecture and scope.
