# Quality gates and CI baseline

`WI-PORT-003`, ADR-0015. What the pipeline (`azure-pipelines.yml`) runs, the exact commands to reproduce each step locally, and what it does **not** cover. **The pipeline has run green on Azure DevOps** (reported by the human lead 2026-10-28; run ID not recorded; the deliberate Cosmos-adapter warning remains; not run on `ubuntu-26.04`). Every command below was also run locally (see `docs/evidence/WI-PORT-003/findings.md`).

## Commands

| Gate | Command (repo root unless noted) | Needs | Pipeline job |
|---|---|---|---|
| .NET format and style | `dotnet format whitespace BakeryMarketplace.slnx --verify-no-changes` and `dotnet format style ... --verify-no-changes`; fix with the same commands without the flag | .NET SDK | `dotnet` |
| .NET build (Roslyn analyzers on) | `dotnet build BakeryMarketplace.slnx` | .NET 10 SDK (projects target `net10.0`) | `dotnet` |
| Shared-library tests | `dotnet test tools/BakeryMarketplace.slnx` | Redis on `127.0.0.1:6379` for real adapter coverage | `dotnet` |
| catalog-service tests | `dotnet test services/catalog-service/tests/CatalogService.Tests` | nothing (in-process, in-memory backends) | `dotnet` |
| Cosmos order-store tests (emulator) | `COSMOS_CONNECTION_STRING=... dotnet test services/ordering-service/tests/OrderingService.Tests --filter CosmosOrderStore` (same variable and emulator as the row below); skipped without it, never faked; not run in CI | the Cosmos vNext emulator | `dotnet` |
| Cosmos concurrency and batch contract tests (emulator) | `COSMOS_CONNECTION_STRING="AccountEndpoint=http://localhost:8081/;AccountKey=<the emulator's documented key>" dotnet test tools/tests/BakeryMarketplace.Data.Tests --filter "FullyQualifiedName~CosmosConcurrency|FullyQualifiedName~CosmosBatch"` after `docker compose up -d cosmos` | the Cosmos vNext emulator; without the variable the 14 tests are reported as skipped (never faked); **not run in CI** | `dotnet` |
| ordering-service tests | `dotnet test services/ordering-service/tests/OrderingService.Tests` | nothing (pure domain tests, no I/O); added 2026-10-28, not yet run on Azure | `dotnet` |
| Redis really reached | `node scripts/ci/redis-touch.mjs snapshot <f>` before, `... assert <f> 50` after | Redis | `dotnet` |
| BFF format, lint, typecheck, tests | `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test` in `services/graphql-bff` | Node >= 24 | `bff` |
| Web format (also `scripts/` and `azure-pipelines.yml`), lint, typecheck (runs `relay-compiler`) | `npm ci && npm run format:check && npm run lint && npm run typecheck` in `apps/web-customer` | Node >= 24 | `web` |
| Web build + mock e2e | `npm run test:e2e` in `apps/web-customer` (builds, starts a mock BFF, Chromium) | `npx playwright install chromium` | `web` |
| Walking skeleton, real stack | `node scripts/ci/skeleton-smoke.mjs` (Compose, seed, catalog, BFF, Next.js, Playwright, teardown) | Docker, .NET, Node, the two `npm ci` runs | `skeleton` |
| Result summary | `node scripts/ci/summarize-results.mjs [--json out] <trx or junit files>` | | all |

## Formatter and linter decision (2026-10-28)

Human lead approved the defaults. **C#:** `dotnet format` (whitespace and style) with a root `.editorconfig`, Roslyn analyzers via `Directory.Build.props` (`AnalysisLevel latest-recommended`). **TypeScript:** Prettier (root `.prettierrc.json`: single quotes, semicolons, width 120) and ESLint 10 flat config per package (`typescript-eslint` recommended; `eslint-config-next` for `web-customer`, which includes React, hooks and a11y rules). Tools are installed per package because there is no root workspace. Alternative considered: Biome (single tool); not chosen because the Next.js and React rule sets live in ESLint.

Rules go in one at a time; severity levels in `.editorconfig` and `eslint.config.mjs` are the place to tighten.

## What is not a gate (and why)

- **Analyzer warnings are not errors.** The .NET build reports 46 `CA` warnings (mostly `CA1510`, `CA1861`, `CA1873`). They are visible, not gating; fix them in a separate pass, then turn on `TreatWarningsAsErrors`.
- **ESLint is the `recommended` set only** (not type-checked); `tsc --noEmit` covers types. `scripts/` is formatted but not linted (ESLint config lives in each package).
- **Docs, Markdown and `.graphql` are not formatted** (`.prettierignore`).
- **Cosmos adapter tests** (`BakeryMarketplace.Data.Tests`): they do **not** run against Cosmos. They default to `https://localhost:8081`, the emulator speaks HTTP, and they fall back to `FakeRepository`; against the real emulator 3 of 4 fail. The pipeline logs a warning saying so. Fix is `WI-DATA-003` (open item #31).
- **Redis adapter tests** fall back to in-memory fakes if the connection fails, with no signal. The pipeline starts Redis, uses `127.0.0.1` (see below) and fails the job if Redis saw fewer than 50 commands during the tests.
- **Security scanning, deployment, post-deploy smoke, contract tests beyond those in the suites above, load/chaos**: not built.
- **Playwright**: Chromium only. Node on the agent is 24.x; the PORT-001 proof ran on 25.9.
- **Coverage**: none measured. Do not claim it.

## Findings that shaped the pipeline

1. `localhost` can silently defeat the Redis tests. On the Windows machine used, `REDIS_CONNECTION_STRING` unset (default `localhost:6379`) connected nothing: all 16 Caching tests passed while Redis saw 2 commands. With `127.0.0.1:6379` they ran against Redis (86 commands for the Caching + Eventing suites). The pipeline sets `127.0.0.1:6379`.
2. The Eventing Redis suite was not repeatable: tests shared one event type, hence one Redis consumer group, and competed for each other's messages. It was already failing on re-runs and became a frequent failure on a fresh Redis under .NET 10 (2 of 3 runs; 4 of 4 passed on .NET 8). **Fixed 2026-10-28**: every test uses event types of its own; 5 consecutive runs on one Redis pass. The silent fallback to fakes (finding 1) is still open (#35).

## When the pipeline runs

Decided 2026-10-28 to save build minutes: **no runs on pushes to any branch, including `main`** (`trigger: none`). It runs on **pull requests into `main`** (not drafts) and **by hand**. To gate `main`, queue it manually: Pipelines → the pipeline → Run pipeline → Branch `main`. A manual run uses the pipeline's *default branch for manual and scheduled builds* unless you pick one, so keep that set to `main` (Edit → ⋯ → Triggers → YAML → Get sources). PR validation stays on so GitHub's required checks (ADR-0015) can point at it.

## Branch protection (soft manual gate)

GitHub rulesets with required checks are not available on this plan (they need an enterprise account), so the Azure Pipelines check (shown on PRs as "Azure Pipelines", 5 checks) is **not enforced**. The human lead reads it and approves the PR by hand, and `main` is also gated by a manual pipeline run. The placeholder `.github/workflows/ci.yml` (check "CI / build-and-test") was removed on 2026-10-28; make sure no branch protection rule still lists it as required, or PRs will wait on it forever. See the ADR-0015 amendment.

## Evidence format (flake and execution time)

`summarize-results.mjs` prints a markdown table and, with `--json`, one record per run:

```
{ "recordedAt": ISO-8601, "commit": "<BUILD_SOURCEVERSION or null>", "build": "<BUILD_BUILDNUMBER or null>", "node": "v24.x",
  "suites": [ { "suite", "kind": "trx|junit", "total", "passed", "failed", "skipped", "notRun", "seconds", "retries" } ] }
```

- Passed, failed, skipped and not-run are separate counts; they are never merged into one "ok".
- `seconds` is the suite's own reported duration, so comparing records shows execution-time drift. `retries` counts tests that failed then passed on retry (Playwright `flakyTest`); the repo currently sets retries to 0, so it is always 0.
- A flake is a suite whose `failed` differs between two runs of the same `commit`. Record runs by saving the JSON under `docs/evidence/<WI-ID>/` or as the pipeline artifact `*-results`; there is no automatic comparison yet.
