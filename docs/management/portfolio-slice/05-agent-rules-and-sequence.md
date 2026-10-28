# Agent operating rules and implementation sequence

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Task contract

Each task states goal, evidence goal, repository baseline,
accepted ADRs/contracts, allowed/prohibited files, dependencies,
acceptance criteria, commands/evidence, privacy/security constraints,
stop conditions, deliverables, and handoff format.

## Rules

-   Inspect actual repository state and commands before editing.
-   Do not broaden scope or silently change architecture.
-   Do not invent features, metrics, test results, or dependency
    behavior.
-   Do not add libraries/services/caches/cloud resources without a
    concrete need and approval if outside scope.
-   Report passed, failed, not run, blocked, and not applicable
    distinctly.
-   Handoff: changed files, exact verification, assumptions/risks,
    evidence, next task.
-   One active owner per shared schema, lockfile, root config, pipeline,
    or central architecture document.

## Sequence

**Phase 0:** inspect tree and commands; adopt ADRs; reconcile docs; pin
runtimes/package manager; run SSR/Relay proof.\
**Phase 1:** one GraphQL query, typed C# downstream client, one SSR
listing, one contract/unit test, one Playwright smoke test, trace,
minimum ADO pipeline.\
**Phase 2:** listing UX/error states, Relay fragments/refetch, cache
tests, accessibility.\
**Phase 3:** options/pickup contracts, server validation, test payment
adapter, idempotent order, confirmation, failure tests.\
**Phase 4:** invariant/property tests, flake metrics, AI-testing
experiment, security/dependency checks.\
**Phase 5:** mobile, notifications, real payment, distributed cache, and
rich search only when the core slice is stable.

Keep SSR/Relay proof, shared schema decisions, checkout semantics, and
CI migration serial. Parallelize quality strategy, observability
planning, pipeline planning, and isolated contract tests only after
boundaries are stable.
