# WI-PORT-003 Findings: quality and CI baseline

> **Current result (2026-10-30):** the pipeline has run green on Azure DevOps, reported by the lead; the last recorded run is `#20261029.4` (build id 18, 2026-10-29), which included ordering-service and the browser journey, with the deliberate Cosmos-adapter warning. The "has not run on Azure" sentence under Result below was true on 2026-10-28 and is kept as the record. Not run on `ubuntu-26.04`. The check is a soft gate.

**Date:** 2026-10-28 · **Branch:** `feature/WI-PORT-003-ci-baseline` · **Files:** `azure-pipelines.yml`, `scripts/ci/`, `docs/process/quality-gates.md`

## Result

The pipeline definition and the scripts it calls are written, and **every command was run locally**. The pipeline itself **has not run on Azure DevOps**, so the acceptance item "runs from clean checkout" on the real system is **not met**. Local environment: Windows 11, Docker Desktop 29.1, Node 25.9.0, .NET SDK 10.

## Update 2026-10-28: Azure DevOps run

After the pipeline fixes (results directory, .NET 10, `UseNode@1`, `ubuntu-24.04` pin, Relay compile before the web build), the human lead reported a **green run on Azure DevOps** with only the deliberate Cosmos-adapter warning. So the acceptance item "runs from clean checkout" is met on the real system. Not recorded: run ID or link (add it here). Not verified: `ubuntu-26.04`. GitHub required checks could not be set (rulesets need an enterprise plan), so the human lead gates PRs by hand; `.github/workflows/ci.yml` was removed anyway (ADR-0015 amendment).

## Update 2026-10-29: a recorded run of the whole pipeline, with ordering and the browser journey

**Azure Pipelines run `#20261029.4` (build id 18)**, the PR build of `feature/slice-1-hardening`, reported by the human lead as **passed and completed** (the branch was then rebase-merged to `main` and deleted). This is the first recorded run of the pipeline as it now stands: the `skeleton` job starts ordering-service and the mock issuer's client secret, runs the browser journey against the real stack, and the run included the fix to the journey's pickup-time assertion. The PR run of the previous branch (ordering, the checkout and order pages, the journey) had failed that one test, which was a bug in the test, not in the app, and everything else in it was clean.

What is and is not recorded: the run name and the build id (**18**) are as the human lead gave them. Not recorded here: a link, and per-job test counts (the results were not read from Azure). Locally the same smoke is 21 of 21. Still not verified: `ubuntu-26.04`; the pipeline stays pinned to `ubuntu-24.04` (open item 44).

## Local runs

| Step | Result |
|---|---|
| `dotnet test tools/BakeryMarketplace.slnx` with Redis on `127.0.0.1` | Pass: Logging 2, Secrets 5, EventSchemas 10, Eventing 6, Caching 16, Auth 23, Data 8 (the Data run takes ~54 s) |
| `dotnet test` catalog-service | Pass: 32 |
| Redis guard, tests run against Redis | `OK`: 86 commands seen (threshold 50) |
| Redis guard, default `localhost`, Caching suite | **Correctly FAILS**: 16 tests passed but Redis saw 2 commands |
| BFF `npm test` with spec + JUnit reporters | 16 of 16 |
| Web mock e2e with `--reporter=list,junit` | 6 of 6 |
| `node scripts/ci/skeleton-smoke.mjs` from a stopped stack | 5 of 5 in 36 s total, services stopped and Compose torn down afterwards |
| Same script with a seed that refuses to run | Exits non-zero, tears down, reports `seed failed (exit 2)` |
| `summarize-results.mjs` over trx and JUnit | Matches the runners' own totals (a parsing bug with `>` in a suite name was found and fixed) |

## Not run

- The pipeline on Azure DevOps (agents, `ubuntu-latest`, `UseDotNet`, `PublishTestResults`, artifact publishing, `docker compose` on the agent).
- Anything on Linux or macOS. The skeleton script uses `taskkill` on Windows and process groups elsewhere; only the Windows branch ran.
- Branch protection / required checks; removing the GitHub placeholder.
- A formatter or linter gate (none chosen; `dotnet format` reports whitespace errors repo-wide).
- The Cosmos adapter tests against Cosmos (they fall back to fakes; 3 of 4 fail against the real emulator).

## Findings

1. **The Redis adapter tests silently skip Redis with `localhost`** (reconciliation finding A8, now demonstrated). Cause not proven; IPv6 resolution of `localhost` while Docker binds `127.0.0.1` is the likely one.
2. **The Eventing Redis suite fails on a re-run against the same Redis** (`DuplicateEventId_IsDeliveredTwice_ConsumerObservesBoth`, `EventTransportContractTests.cs:83`). Passes on a fresh instance. Recorded as open item #35; not fixed (separate work item, shared library).
3. Pipeline guard thresholds were calibrated on this run, not guessed: the first threshold (100) failed against the real count (86), so it was lowered to 50.

## Follow-up: first Azure runs and the .NET 10 upgrade (2026-10-28)

First pipeline runs on Azure DevOps found, in order: the `results` directory did not exist on a fresh agent (fixed, every job now creates it; the summarizer also reports missing files instead of crashing); the agent had only .NET 10 while every project targeted `net8.0` (resolved by upgrading all projects to `net10.0`, approved by the human lead). Upgrade effects: `System.IdentityModel.Tokens.Jwt` pinned to 8.19.2 for JwtBearer 10; the Seed tool's top-level `Program` collided with `CatalogService`'s in the test project (explicit entry point added); `Eventing` Redis tests became flaky (root cause and fix above). Re-verified locally on .NET 10: format and style clean, full .NET suites, 5 repeat runs of the Eventing suite on one Redis, the Docker image build for `mock-oidc`, and the skeleton smoke (5 of 5). The pipeline has still not been seen green on Azure.

## Decisions for the owner

- Whether to pick a formatter/linter (`dotnet format` plus an `.editorconfig`, ESLint/Prettier) before turning on a style gate.
- Creating the Azure DevOps project and service connection (workload identity federation, ADR-0015) so the first real run can happen.

## Next smallest task

Run the pipeline once on Azure DevOps and record the result here, then migrate required checks and remove the placeholder in one commit (ADR-0015). Or fix the test-isolation defect (#35) first so the Eventing suite is repeatable.
