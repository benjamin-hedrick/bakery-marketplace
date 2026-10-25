# Reconciliation — 2026-09-28

**Type:** New reconciliation record. No existing work item is edited.
**Source:** `worklog-2026-09-27.md` and direct review of V1 documents and code.
**Status:** Findings are proposals until verified and dispositioned.

## A. Status drift

| # | Item | Observed | Action |
|---|---|---|---|
| A1 | WI-DEV-001 | Activity log: Done (2026-09-15). WI file: Ready. Batch 1 point open. | Verify, then disposition |
| A2 | WI-DATA-002, WI-CACHE-002, WI-EVT-003, WI-AUTH-002 | Log/epics: Done. WI files: Ready. | Verify, then disposition |
| A3 | WI-CACHE-004 | Epic: Done. WI file: Ready. | Verify, then disposition |
| A4 | WI-VEN-001, WI-PREF-001 | Blocked-by lists DEV-001, now done | Note dependency satisfied |
| A5 | WI-CAT-001 / WI-DEV-004 | Residual reference to old seed ID DEV-003 | Correct in a new note |
| A6 | WI-AUTH-005 | Execution plan: only MockUser.cs exists. No log entry. | Log verified state |
| A7 | Batch 1 verification checkpoint | Parking-lot open; log says review done | Close with pointer after confirming scope |
| A8 | "Done" integration adapters | Three test suites fall back to fakes silently | Track as open item (C3) |

## B. Code findings (read from code, not executed)

| # | Finding | Proposed work |
|---|---|---|
| B1 | RedisCacheProvider.GetAsync converts every exception to a cache miss, so the circuit breaker never trips on reads | Let failures propagate. Add test: failing Redis trips breaker and reads fall back to LocalCacheProvider |
| B2 | RedisStreamsEventTransport may be unable to dead-letter and drops messages (empty catch; deserialization failures acked; NewMessages may never redeliver pending) | Confirm by test first (always-failing handler). If confirmed: logging, XAUTOCLAIM redelivery, deserialization to dead-letter, dead-letter contract test |
| B4 | Sealing inconsistent across adapters | Low priority; decide with B1/B2 |
| B5 | Mixed Microsoft.Extensions 10.x and 8.x on net8.0 | Low priority; central package management |

## C. Process and tooling

| # | Item | Proposed work |
|---|---|---|
| C1 | No formatter/analyzer chosen | Decision: .editorconfig + dotnet format + analyzers (C#); ESLint flat config + formatter (TS) |
| C2 | WI-WEB-001 lacks strict TS, innerHTML rule, VITE_ secret rule, effect cleanup | Amendment note, not an edit to the WI |
| C3 | Test suites fall back to fakes | REQUIRE_INFRA flag; enable in CI once DEV-002 exists; re-run against real containers in M1 |
| C4 | Stripe method not recorded (SAQ A vs SAQ A-EP) | Record when CUST-003 is built; amend ADR-0005 after confirming with acquirer/Stripe |

## D. Open decisions (human authority)

- D1: Whether B1/B2 are fixed inside the V1 local-demo plan or after it.
- D2: Whether the V1 UI rework supersedes frontend items here. Until confirmed, all frontend items stay open.
- D3: Scope of Phase 1 redefinition. New open item, owner TBD.

Nothing here is accepted. Dispositions are recorded in a follow-up record.
