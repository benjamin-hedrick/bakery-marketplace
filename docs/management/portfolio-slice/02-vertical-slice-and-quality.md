# Vertical slice and quality plan

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Journey and increments

1.  **Walking skeleton:** one seeded listing query through Next.js SSR →
    Relay-compatible handoff → GraphQL BFF → one C# API; one
    unit/contract test, one Playwright smoke test, one trace.
2.  **Listing:** stable IDs, deterministic seeds,
    loading/empty/unavailable/error states, freshness policy.
3.  **Options/pickup:** server-owned validation, timezone/expiry rules,
    accessible controls.
4.  **Checkout:** server revalidation, idempotent submission,
    deterministic test payment adapter, persisted order and refreshable
    confirmation.
5.  **Operational proof:** CI, correlated trace, safe errors, controlled
    failure, measured test execution/flake baseline.

## Test layers

Unit/domain invariants; component; GraphQL schema and C# API contract;
integration; Playwright black-box journeys; resilience/security for
timeouts, retries, malformed input, authorization, and duplicate
requests. Add Maestro only when a mobile client exists.

## Test principles

Use deterministic isolated fixtures, avoid sleeps, record retries,
include safe diagnostics, and test invariants such as nonnegative
totals, valid order transitions, and idempotency. Distinguish coverage
from test effectiveness.

## AI-assisted test experiment

Use a stable bounded requirement set. Have an agent propose/implement
tests under a task contract; human-review before merge. Record accepted
cases, duplicates, false assumptions, defects caught, review/rework
time, run time, and maintenance cost. Do not claim speedup without a
documented baseline.

## CI gates

Start with formatting/lint/type checks, build, unit/component tests, and
schema/contract checks. Add integration and Playwright when runnable.
Publish diagnostics; quarantine flaky tests only with owner, reason, and
review date.

## Metrics

Define numerator, denominator, and collection method for pass rate,
rerun/flake rate, median/tail execution time, diagnosis time, defects
caught, and AI-test review/maintenance cost.
