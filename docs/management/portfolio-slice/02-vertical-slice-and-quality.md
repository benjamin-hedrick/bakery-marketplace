# Vertical slice and quality plan

> **Status:** Adopted plan · status checked 2026-10-30.

> **Update 2026-11-08:** the increments are done; the AI-assisted testing experiment stays deferred by decision (`WI-QA-003`); the flake baseline (620 runs, 0 failures), the metrics script, Maestro flows for the Android app and the security checks (audit, ZAP, Sonar, secret scan) have been run locally. See `docs/testing.md`.

| Part of the plan | State |
|---|---|
| Increments 1 to 4 (walking skeleton, listing, options and pickup, checkout) | Done in slice 1 |
| Increment 5, operational proof | CI, a correlated trace and safe errors done; a controlled-failure trace not recorded as such (a Redis outage was run for the outbox); a flake baseline taken once by hand (2026-10-30) |
| Test layers | Unit and domain invariants, contract, integration, Playwright journeys built; resilience tests partial (idempotency, duplicate submit, declined payment; no timeout test because the payment stub has no delay, register 92) |
| AI-assisted test experiment | Not done |
| CI gates | Format, lint, type, build, unit and journey tests in the pipeline; no flake quarantine (none was needed) |
| Metrics | The record format is defined (`quality-gates.md`); one baseline exists; no series |

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
