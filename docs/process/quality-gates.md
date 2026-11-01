# Quality gates and CI baseline

> **Status:** Current · updated 2026-10-30 (test counts, the documentation checks and the enforcement summary were added; the rest dates from 2026-10-28 and is unchanged).

The testing approach is in [`test-strategy.md`](test-strategy.md). `WI-PORT-003`, ADR-0015. What the pipeline (`azure-pipelines.yml`) runs, the exact commands to reproduce each step locally, and what it does **not** cover. **The pipeline has run green on Azure DevOps** (reported by the human lead 2026-10-28; most recent recorded run `#20261029.4`, 2026-10-29, which included ordering-service and the browser journey; the deliberate Cosmos-adapter warning remains; not run on `ubuntu-26.04`). Every command below was also run locally (see `docs/evidence/WI-PORT-003/findings.md`).

## Commands

| Gate | Command (repo root unless noted) | Needs | Pipeline job |
|---|---|---|---|
| .NET format and style | `dotnet format whitespace BakeryMarketplace.slnx --verify-no-changes` and `dotnet format style ... --verify-no-changes`; fix with the same commands without the flag | .NET SDK | `dotnet` |
| .NET build (Roslyn analyzers on) | `dotnet build BakeryMarketplace.slnx` | .NET 10 SDK (projects target `net10.0`) | `dotnet` |
| Shared-library tests | `dotnet test tools/BakeryMarketplace.slnx` | Redis on `127.0.0.1:6379` for real adapter coverage | `dotnet` |
| catalog-service tests | `dotnet test services/catalog-service/tests/CatalogService.Tests` | nothing (in-process, in-memory backends) | `dotnet` |
| Cosmos order-store tests (emulator) | `COSMOS_CONNECTION_STRING=... dotnet test services/ordering-service/tests/OrderingService.Tests --filter CosmosOrderStore` (same variable and emulator as the row below); skipped without it, never faked; not run in CI | the Cosmos vNext emulator | `dotnet` |
| Cosmos concurrency and batch contract tests (emulator) | `COSMOS_CONNECTION_STRING="AccountEndpoint=http://localhost:8081/;AccountKey=<the emulator's documented key>" dotnet test tools/tests/BakeryMarketplace.Data.Tests --filter "FullyQualifiedName~CosmosConcurrency|FullyQualifiedName~CosmosBatch"` after `docker compose up -d cosmos` | the Cosmos vNext emulator; without the variable the 14 tests are reported as skipped (never faked); **not run in CI** | `dotnet` |
| Linux reproduction of the .NET test steps | `node scripts/ci/linux-check.mjs [tools|catalog|ordering]` | Docker; tests the **committed** tree (a temporary git worktree) in `mcr.microsoft.com/dotnet/sdk:10.0`; emulator tests skip as in the pipeline | `node`, `docker` |
| ordering-service tests | `dotnet test services/ordering-service/tests/OrderingService.Tests` | nothing (pure domain tests, no I/O); added 2026-10-28; passed in the Azure run `#20261029.4` | `dotnet` |
| Redis really reached | `node scripts/ci/redis-touch.mjs snapshot <f>` before, `... assert <f> 50` after | Redis | `dotnet` |
| **All Node gates in one command** | `node scripts/ci/node-gates.mjs` (add `--tests` for the BFF and web unit tests): the BFF and web format, lint and typecheck rows below plus the documentation status check; runs every step and lists all failures; exit 1 on any. Run it before every push | `npm ci` in both projects | `bff`, `web` |
| BFF format, lint, typecheck, tests | `npm ci && npm run format:check && npm run lint && npm run typecheck && npm test` in `services/graphql-bff` | Node >= 24 | `bff` |
| Web format (also `scripts/` and `azure-pipelines.yml`), lint, typecheck (runs `relay-compiler`) | `npm ci && npm run format:check && npm run lint && npm run typecheck` in `apps/web-customer` | Node >= 24 | `web` |
| Web build + mock e2e | `npm run test:e2e` in `apps/web-customer` (builds, starts a mock BFF, Chromium) | `npx playwright install chromium` | `web` |
| Walking skeleton, real stack | `node scripts/ci/skeleton-smoke.mjs` (local secrets, Compose with the mock issuer, seed, catalog, ordering, BFF, Next.js, Playwright, teardown) | Docker, .NET, Node, the two `npm ci` runs | `skeleton` |
| Result summary | `node scripts/ci/summarize-results.mjs [--json out] <trx or junit files>` | | all |
| Documentation status | `node scripts/docs/status.mjs --check` (regenerate with no flag): every spec has a banner, headers agree with banners, epic counts match their specs, `STATUS.md` is current | Node | `docs` (written 2026-10-30; seen green on Azure 2026-10-31) |
| Traceability table | `node scripts/docs/traceability.mjs --check` (regenerate with no flag): `docs/product/backlog/TRACEABILITY.md` lists, for each built or Done work item, the test files and evidence records that name it | Node, git | `docs` (written 2026-10-30; seen green on Azure 2026-10-31) |
| Documentation links | `node scripts/docs/linkcheck.mjs . [out.json] --fail-on-broken-links`: relative links (fails on a broken one) and backtick paths that name repo files (counted only: some are historical or project-relative); also counts a list of stale phrases | Node, git | `docs` (written 2026-10-30; seen green on Azure 2026-10-31) |
| Docs site build | `mkdocs build` (needs `pip install mkdocs-material`; not installed in the repo's tooling). Run once on 2026-10-30: built, one link outside `docs/` found and fixed. The site is not published | Python | **none** |
| Diagram syntax | no script in the repository. On 2026-10-30 the Mermaid blocks were parsed ad hoc with `mermaid@11.4.1` and `jsdom` | Node | **none** |

## Formatter and linter decision (2026-10-28)

Human lead approved the defaults. **C#:** `dotnet format` (whitespace and style) with a root `.editorconfig`, Roslyn analyzers via `Directory.Build.props` (`AnalysisLevel latest-recommended`). **TypeScript:** Prettier (root `.prettierrc.json`: single quotes, semicolons, width 120) and ESLint 10 flat config per package (`typescript-eslint` recommended; `eslint-config-next` for `web-customer`, which includes React, hooks and a11y rules). Tools are installed per package because there is no root workspace. Alternative considered: Biome (single tool); not chosen because the Next.js and React rule sets live in ESLint.

Rules go in one at a time; severity levels in `.editorconfig` and `eslint.config.mjs` are the place to tighten.

## What is not a gate (and why)

- **Analyzer warnings are not errors.** The .NET build reported 46 `CA` warnings when this was written (2026-10-28) and 82 warnings in a clean-clone build on 2026-10-30 (mostly `CA1510`, `CA1861`, `CA1873`). They are visible, not gating; fix them in a separate pass, then turn on `TreatWarningsAsErrors`.
- **ESLint is the `recommended` set only** (not type-checked); `tsc --noEmit` covers types. `scripts/` is formatted but not linted (ESLint config lives in each package).
- **Docs, Markdown and `.graphql` are not formatted** (`.prettierignore`).
- **Cosmos adapter tests** (`BakeryMarketplace.Data.Tests`): they do **not** run against Cosmos. They default to `https://localhost:8081`, the emulator speaks HTTP, and they fall back to `FakeRepository`; against the real emulator 3 of 4 fail. The pipeline logs a warning saying so. The fix was named `WI-DATA-003`, which has no spec (open item #31, still open on 2026-10-30).
- **Redis adapter tests** fall back to in-memory fakes if the connection fails, with no signal. The pipeline starts Redis, uses `127.0.0.1` (see below) and fails the job if Redis saw fewer than 50 commands during the tests.
- **Security scanning, deployment, post-deploy smoke, contract tests beyond those in the suites above, load/chaos**: not built.
- **Playwright**: Chromium only. Node on the agent is 24.x; the PORT-001 proof ran on 25.9.
- **Coverage**: none measured. Do not claim it.

## Findings that shaped the pipeline

1. `localhost` can silently defeat the Redis tests. On the Windows machine used, `REDIS_CONNECTION_STRING` unset (default `localhost:6379`) connected nothing: all 16 Caching tests passed while Redis saw 2 commands. With `127.0.0.1:6379` they ran against Redis (86 commands for the Caching + Eventing suites). The pipeline sets `127.0.0.1:6379`.
2. The Eventing Redis suite was not repeatable: tests shared one event type, hence one Redis consumer group, and competed for each other's messages. It was already failing on re-runs and became a frequent failure on a fresh Redis under .NET 10 (2 of 3 runs; 4 of 4 passed on .NET 8). **Fixed 2026-10-28**: every test uses event types of its own; 5 consecutive runs on one Redis pass. The silent fallback to fakes (finding 1) is still open (#35).

## Test baseline (2026-10-30)

Run locally on a Windows machine from the committed tree, then again in a fresh clone (`docs/evidence/baseline-2026-10-30.md`). Passed, failed and skipped are separate.

| Suite | Result |
|---|---|
| Shared libraries (`tools/BakeryMarketplace.slnx`, 7 projects) | 214 passed, 0 failed, 15 skipped (the Data project's emulator-gated tests) |
| `CatalogService.Tests` | 104 passed |
| `OrderingService.Tests` | 337 passed, 3 skipped, 0 failed |
| `services/graphql-bff` | 75 passed |
| `apps/web-customer` unit | 53 passed |
| Mock-backed browser suite | 57 tests, 10 runs: 570 executions, 0 failures; 27.6 to 30.0 s a run; one worker, no retries |
| SSR isolation | 200 of 200 responses contained only their own fixture |
| Real-stack journeys | 21 tests; 3 full-stack runs and 1 hand-started stack, all passed; 18.9 to 19.7 s of tests; the first journey on a cold stack about 9 s |

Not run in the pipeline: the emulator-gated Cosmos tests, the real-stack journeys beyond the `skeleton` job, mutation checks (a sample of 10 by hand: 9 killed, 1 survived, register 85).

## Where each check is enforced (2026-10-30)

"Enforced" means something fails or blocks without a person remembering to run it. The Azure Pipelines check itself is a soft gate: nothing blocks a merge with a red or missing check (below).

| Check | Runs in the pipeline on a PR | Locally | Blocks a merge |
|---|---|---|---|
| .NET format and style, build, shared-library, catalog and ordering tests | Yes (`dotnet` job) | Commands above | No (soft gate: the lead reads the check) |
| BFF format, lint, typecheck, tests | Yes (`bff` job) | Yes | No |
| Web format, lint, typecheck, mock browser suite | Yes (`web` job) | Yes | No |
| .NET tests with a hang timeout | Yes (`--blame-hang-timeout 5m` on the three `dotnet test` steps; added 2026-11-02, not yet run on Azure) | Yes (`linux-check.mjs`, 2 CPUs, 3 minutes) | No |
| Queue display format, lint, typecheck, unit tests, mock browser suite | Yes (`queue` job; written 2026-11-02, **not yet run on Azure**) | Yes (format, lint, typecheck, unit tests in `node-gates.mjs`) | No |
| Real-stack journeys | Yes (`skeleton` job) | `skeleton-smoke.mjs` | No |
| Documentation status check | Yes, seen green on Azure 2026-10-31 (`docs` job) | `status.mjs --check`; also in `scripts/ci/node-gates.mjs` | No (soft gate) |
| Link check | Yes, seen green on Azure 2026-10-31 (`docs` job): fails on a broken relative link only | `linkcheck.mjs --fail-on-broken-links` (0 broken links; 213 unresolved backtick paths are counted, not enforced); also in `node-gates.mjs` | No (soft gate) |
| Diagram syntax | **No** | ad hoc | **No** |
| Secret scan (full history) | Yes, seen green on Azure 2026-10-31 (`secrets` job) | `node scripts/ci/secret-scan.mjs` (gitleaks container, `.gitleaks.toml`); run locally, no leaks | No |
| Dependency audit, SBOM | **No** (not built) | `npm audit` by hand | **No** |

The documentation checks are now a pipeline job (register item 90, option a) and part of `node scripts/ci/node-gates.mjs`; being a soft gate, a reviewer still has to read the check. A git hook or a Claude Code hook (options b and c) were not added. Not enforced: broken backtick paths (a count, no threshold) and the Mermaid diagram syntax.

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

## Seen on Azure (2026-10-31)

Reported by the human lead for the pull request that merged the second batch of work (branch `feature/ops-and-okrs`): all six jobs of `azure-pipelines.yml` passed. The run id was not recorded.

| Job | Duration |
|---|---|
| Secret scan (gitleaks, full history) | 14 s |
| Documentation checks (status, links, traceability table) | 4 s |
| .NET build and tests | 2 m 44 s |
| GraphQL BFF | 1 m 9 s |
| web-customer (mock BFF) | 2 m 59 s |
| Walking skeleton (real stack) | 5 m 3 s |

Build 25 of the pull request for `feature/dev-environment` (2026-10-31, reported by the lead): the `terraform` job (fmt, validate, mocked-provider tests and the script tests) passed in 16 s, the first run of it on Azure; secret scan 13 s, documentation checks 7 s, GraphQL BFF 1 m 8 s, web-customer 3 m 5 s and the walking skeleton (real stack) 5 m 21 s passed. The `.NET build and tests` job took 22 s, the time of the failure in the step that starts Redis for the adapter tests, caused by a required Compose variable (fixed in `42391dd`, see `docs/method/ai-collaboration.md`); it has not been seen green with the fix. The docs job's duration is the whole job, so it does not show which of its checks ran; the traceability check was added to it before that pull request.

