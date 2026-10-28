# Quality gates and CI baseline

`WI-PORT-003`, ADR-0015. What the pipeline (`azure-pipelines.yml`) runs, the exact commands to reproduce each step locally, and what it does **not** cover. **The pipeline has never run on Azure DevOps**; every command below was run locally (see `docs/evidence/WI-PORT-003/findings.md`).

## Commands

| Gate | Command (repo root unless noted) | Needs | Pipeline job |
|---|---|---|---|
| .NET build | `dotnet build BakeryMarketplace.slnx` | .NET SDK 9+ for `.slnx` (10.x used locally); projects target `net8.0` | `dotnet` |
| Shared-library tests | `dotnet test tools/BakeryMarketplace.slnx` | Redis on `127.0.0.1:6379` for real adapter coverage | `dotnet` |
| catalog-service tests | `dotnet test services/catalog-service/tests/CatalogService.Tests` | nothing (in-process, in-memory backends) | `dotnet` |
| Redis really reached | `node scripts/ci/redis-touch.mjs snapshot <f>` before, `... assert <f> 50` after | Redis | `dotnet` |
| BFF typecheck, tests | `npm ci && npm run typecheck && npm test` in `services/graphql-bff` | Node >= 24 | `bff` |
| Web typecheck (runs `relay-compiler`) | `npm ci && npm run typecheck` in `apps/web-customer` | Node >= 24 | `web` |
| Web build + mock e2e | `npm run test:e2e` in `apps/web-customer` (builds, starts a mock BFF, Chromium) | `npx playwright install chromium` | `web` |
| Walking skeleton, real stack | `node scripts/ci/skeleton-smoke.mjs` (Compose, seed, catalog, BFF, Next.js, Playwright, teardown) | Docker, .NET, Node, the two `npm ci` runs | `skeleton` |
| Result summary | `node scripts/ci/summarize-results.mjs [--json out] <trx or junit files>` | | all |

## What is not a gate (and why)

- **Formatter / linter: none chosen** (`engineering-standards.md`). `dotnet format --verify-no-changes` was tried on 2026-10-28 and reports whitespace errors across the solution (there is no `.editorconfig`), so adopting it is a separate decision plus a one-off reformat, not something to switch on silently. No ESLint/Prettier config exists.
- **Cosmos adapter tests** (`BakeryMarketplace.Data.Tests`): they do **not** run against Cosmos. They default to `https://localhost:8081`, the emulator speaks HTTP, and they fall back to `FakeRepository`; against the real emulator 3 of 4 fail. The pipeline logs a warning saying so. Fix is `WI-DATA-003` (open item #31).
- **Redis adapter tests** fall back to in-memory fakes if the connection fails, with no signal. The pipeline starts Redis, uses `127.0.0.1` (see below) and fails the job if Redis saw fewer than 50 commands during the tests.
- **Security scanning, deployment, post-deploy smoke, contract tests beyond those in the suites above, load/chaos**: not built.
- **Playwright**: Chromium only. Node on the agent is 24.x; the PORT-001 proof ran on 25.9.
- **Coverage**: none measured. Do not claim it.

## Findings that shaped the pipeline

1. `localhost` can silently defeat the Redis tests. On the Windows machine used, `REDIS_CONNECTION_STRING` unset (default `localhost:6379`) connected nothing: all 16 Caching tests passed while Redis saw 2 commands. With `127.0.0.1:6379` they ran against Redis (86 commands for the Caching + Eventing suites). The pipeline sets `127.0.0.1:6379`.
2. The Eventing Redis suite is not repeatable on one Redis instance: it passes on a fresh Redis and `DuplicateEventId_IsDeliveredTwice_ConsumerObservesBoth` (line 83) failed on an immediate re-run (open item #35). CI is safe because each job gets a fresh container; local runs need `docker compose down` or `redis-cli flushall` between runs.

## Branch protection (manual, not done)

ADR-0015's exit criteria need GitHub required checks to point at the Azure Pipelines checks and the placeholder `.github/workflows/ci.yml` removed in one migration commit. Both need the Azure DevOps project, the GitHub service connection and a first green run, none of which exist yet. Until then the placeholder stays.

## Evidence format (flake and execution time)

`summarize-results.mjs` prints a markdown table and, with `--json`, one record per run:

```
{ "recordedAt": ISO-8601, "commit": "<BUILD_SOURCEVERSION or null>", "build": "<BUILD_BUILDNUMBER or null>", "node": "v24.x",
  "suites": [ { "suite", "kind": "trx|junit", "total", "passed", "failed", "skipped", "notRun", "seconds", "retries" } ] }
```

- Passed, failed, skipped and not-run are separate counts; they are never merged into one "ok".
- `seconds` is the suite's own reported duration, so comparing records shows execution-time drift. `retries` counts tests that failed then passed on retry (Playwright `flakyTest`); the repo currently sets retries to 0, so it is always 0.
- A flake is a suite whose `failed` differs between two runs of the same `commit`. Record runs by saving the JSON under `docs/evidence/<WI-ID>/` or as the pipeline artifact `*-results`; there is no automatic comparison yet.
