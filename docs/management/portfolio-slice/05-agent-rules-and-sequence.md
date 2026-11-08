# Agent operating rules and implementation sequence

> **Status:** Adopted plan · status checked 2026-10-30. The rules are still followed (they are in `CLAUDE.md` and `docs/process/`); the sequence below is mostly done.

> **Update 2026-11-08:** phases 0 to 5 are done locally (including mobile and notifications); the AI-assisted testing experiment is deferred by decision (`WI-QA-003`).

| Phase | State |
|---|---|
| 0 Inspect, adopt ADRs, reconcile docs, pin runtimes, SSR/Relay proof | Done, except the exact Node LTS pin (engines say Node 24 or later) and the documentation reconciliation, which `WI-PORT-006` pass 2 is finishing |
| 1 One query, typed client, SSR listing, contract test, smoke test, trace, pipeline | Done |
| 2 Listing UX and error states, Relay refetch, cache tests, accessibility | Mostly done; cache tests and an accessibility pass beyond lint rules are not |
| 3 Options and pickup, validation, test payment, idempotent order, confirmation, failure tests | Done |
| 4 Invariant and property tests, flake metrics, AI-testing experiment, security and dependency checks | Not done (see `current-plan.md` for where the next work is listed) |
| 5 Mobile, notifications, real payment, distributed cache, rich search | Not started |

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
