# Scripts and commands: start, stop, demo, test, gates

> **Status:** Snapshot · written 2026-11-04 from each script's own header comment and from `CLAUDE.md`, `local-dev.md` and `demo.md`. The mobile scripts (`mobile-flows`, `mobile-demo`, `mobile-stack`) were run on 2026-11-04; the others were **not** re-run for this page. `node scripts/docs/scripts-index.mjs --check` (in the documentation gates) fails when a script under `scripts/` has no row here, so the list cannot silently lose one. What a script proves is limited to what its header says.

Run everything from the repository root unless a row says otherwise. Nothing here deploys anything: the stack, the demos and the tests run on one machine. Windows 11 with Docker Desktop and Git Bash is what these were written and run on; the pipeline is Ubuntu (`linux-check.mjs` bridges that).

## 1. Which command do I want?

| I want to... | Run |
|---|---|
| show the web app (browse, log in, order, watch status) | `node scripts/dev/demo.mjs` |
| show the Android app on the emulator | `node scripts/dev/mobile-demo.mjs` |
| work on the services by hand | the steps in `local-dev.md` ("Run slice 1"), or `node scripts/dev/mobile-stack.mjs` for just the backend |
| check the web app's real journeys against the real stack | `node scripts/ci/skeleton-smoke.mjs` |
| check the Android app's flows | `node scripts/dev/mobile-flows.mjs` |
| be sure a push is clean | `node scripts/ci/node-gates.mjs --tests`, `node scripts/ci/linux-check.mjs` (if .NET changed), `node scripts/ci/secret-scan.mjs` |
| reset everything | `docker compose --profile apps --profile with-redis down` (the scripts do this themselves when they stop) |

## 2. Start and stop the local stack

| Command | What it does | Needs | Stops |
|---|---|---|---|
| `node scripts/dev/init-env.mjs` | Creates the local secrets in the git-ignored `.env` (service client secret, session key); `--rotate` replaces them. Prints no values. | Node | (one-shot) |
| `docker compose up -d --build` | Redis Streams (`redis-events`), the Cosmos vNext emulator, the mock OIDC issuer. `--profile with-redis` adds the cache Redis (sessions); `--profile apps` adds the catalog, ordering, BFF and web containers (needs `ORDERING_CLIENT_SECRET` from `init-env`, `COMPOSE_PARALLEL_LIMIT=1`). | Docker | `docker compose down` (resets all state) |
| `node scripts/dev/check-env.mjs [--with-redis] [--wait 90]` | Exit 0 when the infrastructure answers, 1 otherwise; `--wait` retries. | Docker up | (one-shot) |
| `node scripts/dev/mobile-stack.mjs [--keep]` | Compose, seed, catalog, ordering and the BFF, `adb reverse` for 5100 and 4100; no web app, no emulator, no app. | Docker, .NET, Node | Enter, Ctrl+C or the file `artifacts/mobile/STOP`; tears down unless `--keep` |
| `scripts/lib/local-stack.mjs`, `scripts/lib/mobile.mjs`, `scripts/lib/flow-control.mjs` | Not commands: the stack start-up, the emulator, build and install helpers, and the small local server (`127.0.0.1:4199`) that `mobile-flows.mjs` starts for the Maestro flows (reports a customer's newest order, counts their orders, stops and starts the BFF, restarts the mock issuer's container; it no longer sets any profile: those are seed data). Test tooling only, on the review list (register 150): it refuses calls from a browser page and any call without its header (`scripts/ci/tests/flow-control.test.mjs`). | | |

Ports: 3000 customer web, 3100 queue display, 4000 mock BFF (browser suites), 4100 GraphQL BFF, 5100 mock issuer, 5200 catalog, 5300 ordering, 5400 notification, 6379 events Redis, 6380 cache Redis, 6381 sessions Redis, 8081 Cosmos emulator (Metro's usual port too; the Android app does not use Metro, register 147). `scripts/dev/check-env.mjs` reads the same variables as `docker-compose.yml`.

## 3. Demos

| Command | What it shows | Notes |
|---|---|---|
| `node scripts/dev/demo.mjs [--keep] [--stop-after N] [--customer-only]` | The **web** slice, both halves: browse with stock, log in, add to order, place a test order, watch its status (customer, port 3000), and the vendor's live queue where the order appears and is accepted and moved along (port 3100; `--customer-only` skips it). Starts everything, warms it, prints a guide, waits for Enter. | `docs/operations/demo.md`. Ports 3000, 3100, 4100, 5200, 5300 must be free. No test hooks (never sets `ENABLE_TEST_HOOKS`). Needs `npm ci` in `apps/web-customer`, `apps/web-queue-display`, `services/graphql-bff` and `packages/web-session`. |
| `node scripts/dev/mobile-demo.mjs [--no-build] [--keep] [--phone-only]` | The **Android** app on the `bakery_pixel` emulator (window shown): the same journey on the phone, restart without login, sign-out, cancel. Also starts the vendor's live queue screen (port 3100; `--phone-only` skips it) so an order from the phone can be accepted and moved along. Boots the emulator, starts the stack **without** the test hook, builds and installs a **non-test** build, opens the app, waits for Enter. | First build about ten minutes. Needs JDK 17 and the Android SDK (`apps/mobile-customer/README.md`). Maestro is not needed. |
| `node scripts/dev/capture-journey.mjs [folder]` | Nine screenshots of the web journey for `demo.md` against a **running** demo, including the allergen profile, the warnings and the order history; places one real test order and saves a tree-nut allergy for Alice (nothing else). | Needs Playwright's Chromium in `apps/web-customer`. |

## 4. Tests

### Unit and library tests (no Docker unless noted)

| Where | Command |
|---|---|
| C# libraries (`tools/`) | `dotnet test tools/BakeryMarketplace.slnx` (the Redis and Cosmos adapter tests skip or fall back to fakes without Docker; set `REDIS_CONNECTION_STRING=127.0.0.1:6379` to be sure they hit Redis) |
| C# services | `dotnet test services/catalog-service/tests/CatalogService.Tests`, `.../ordering-service/tests/OrderingService.Tests`, `.../notification-service/tests/NotificationService.Tests` |
| GraphQL BFF | `cd services/graphql-bff && npm ci && npm test` |
| Shared customer package | `cd packages/customer-core && npm ci && npm test` |
| Session package | `cd packages/web-session && npm ci && npm test` (13 Redis store tests run only with `REDIS_CONNECTION_STRING`) |
| Queue display unit tests | `cd apps/web-queue-display && npm ci && npm run test:unit` |
| Pipeline scripts | `node --test "scripts/ci/tests/*.test.mjs"` (the destroy guard and the pipeline files) |

### Browser and device tests

| Command | What it does | Notes |
|---|---|---|
| `cd apps/web-customer && npm run test:e2e` (and `apps/web-queue-display`) | Playwright against the **mock** BFF; builds the app first. | `npx playwright install chromium` once. `BROWSERS=all` adds Firefox and WebKit. |
| `node scripts/ci/skeleton-smoke.mjs [--keep] [--containers]` | The **real** stack plus the Playwright journeys; `--containers` runs the application containers instead of host processes. | `docs/evidence/WI-PORT-002/`. Real issuer, no real identity provider. |
| `node scripts/dev/mobile-flows.mjs [--no-build] [--flow 03] [--keep]` | The Android app's fifteen Maestro flows on the emulator against the real stack, one command from a cold start. Exit 0 only if every flow passed. | `docs/evidence/WI-MOB-001/`. The same app and stack as the demo (no test build or hook since `WI-ORD-010`). Local only, no CI (register 148). |
| `node scripts/ci/repeat-suite.mjs [--runs 10]` | The mock-backed browser suite repeated, with a quality report. | Flake baseline, `docs/evidence/baseline-2026-10-30.md`. |
| `node scripts/ci/test-report.mjs [--only a,b] [--skip-dotnet] [--skip-js] [--write]` | Runs every .NET test project and the `node --test` suites once and reports tests run, passed, failed and skipped, and line coverage of the product code; lists the Playwright suites and counts the Maestro flows. `--write` makes the dated record `docs/evidence/test-and-coverage-<date>.md`. | Several minutes. Set `REDIS_CONNECTION_STRING` and `COSMOS_CONNECTION_STRING` (containers up) so the Redis and Cosmos tests run instead of skipping; the record says which mode it ran in. Line coverage only; the browser suites and Maestro flows are not in the figure. |
| `node scripts/dev/check-stream-passthrough.mjs` | The built queue display relays an event stream incrementally, uncompressed, and frees the BFF call when the browser leaves. | Needs `npm run build` in `apps/web-queue-display`. |

### Measurements and scans (on the local stack)

| Command | What it does |
|---|---|
| `node scripts/dev/measure-latency.mjs [--reads 50] [--orders 20]` | Sequential latency (p50, p95, max) of reads and checkout against a **running** demo. |
| `node scripts/dev/load-test.mjs --minutes 3 [--bff-rate-limit 600 [--client-addresses]]` | Load and soak of the live vendor queue on the real stack (`WI-SEC-005`); the long run is in `docs/evidence/WI-SEC-005/`. |
| `node scripts/ci/zap-scan.mjs` | OWASP ZAP baseline of both web apps and an API scan of the BFF (Docker; unauthenticated). |
| `node scripts/dev/film/film.mjs [--dry-run] [--no-build] [--no-phone] [--keep]` | The demo film director (register 163, `docs/operations/demo-film.md`): starts the stack, the queue display and the emulator, records a web customer, a phone customer (Maestro flow `.maestro/demo/phone-max.yaml`) and the bakery's live queue while other customers order, and writes `timeline.json`. Run for the film of 2026-11-08 (four full runs and two without the phone). `--dry-run` starts nothing. |
| `node scripts/dev/film/compose.mjs --run <dir> [--out film.mp4]` | Turns a film run's recordings into one 1920x1080 MP4 with captions (needs ffmpeg). `--selftest` composes synthetic recordings. Used for the film of 2026-11-08. |
| `node scripts/dev/film/record-phone.mjs [--out dir] [--size 540x1200]` | Records the Android emulator in 3-minute chunks (`adb screenrecord`) with their wall-clock start times, for the demo film (register 163). Watches only; stop it with the file `<out>/STOP` or Ctrl+C **before** the emulator goes away. Used by the film director. |
| `node scripts/ci/dependency-audit.mjs [--no-sbom] [--out dir]` | `npm audit` of every npm project (all and production-only), NuGet vulnerable and deprecated packages, and CycloneDX 1.6 SBOMs of the apps and services (`WI-SEC-004`). Needs the network and `npm ci` in each project. Exit 1 = a high or critical advisory in production npm dependencies or a vulnerable NuGet package (proposed policy); exit 2 = a step could not run. Writes to `artifacts/dependency-audit/`; the first run is in `docs/evidence/WI-SEC-004/`. |
| `node scripts/ci/sonar-scan.mjs [--keep]` | SonarQube Community Build static analysis of the committed tree (C# and TypeScript) in Docker; prints the quality gate and issue counts; `--keep` leaves the server on :9000. No account; nothing leaves the machine. |

## 5. Gates before a push

| Command | What it checks |
|---|---|
| `node scripts/ci/node-gates.mjs [--tests]` | Format, lint and typecheck of the BFF, the web app, the queue display, the mobile app and the two packages, plus the documentation checks below; `--tests` adds the unit tests. Every step runs; exit 1 if any failed. **Run before every push.** |
| `node scripts/ci/linux-check.mjs [step...]` | The pipeline's .NET steps on Linux in a 2 CPU container from the **committed** tree (build, format, tools, catalog, ordering). Run when .NET changed. |
| `node scripts/ci/secret-scan.mjs` | gitleaks over the full committed history (Docker). Exit 1 = a finding. **Run before every push.** |
| `node scripts/ci/terraform-checks.mjs` | Terraform format, init, validate and mocked-provider tests for `infra/` (Docker; no Azure account). |
| `node scripts/ci/destroy-guard.mjs --plan ... --environment dev ...` | The pipeline's guard on environment teardown (ADR-0020); not run by hand. |
| `dotnet format whitespace BakeryMarketplace.slnx --verify-no-changes` (and `style`) | C# formatting. |

## 6. Documentation tools

| Command | What it does |
|---|---|
| `node scripts/docs/status.mjs [--check]` | Regenerates `docs/product/backlog/STATUS.md` from the spec banners, ADRs and the register; `--check` fails when out of date. Run after changing a banner. |
| `node scripts/docs/traceability.mjs [--check]` | Regenerates `TRACEABILITY.md` (which test files and evidence name each work item). |
| `node scripts/docs/linkcheck.mjs . --fail-on-broken-links` | Broken relative links and backtick paths in the Markdown. |
| `node scripts/docs/scripts-index.mjs [--check]` | Fails when a script under `scripts/` has no row on this page. |

## 7. Helpers the other scripts use

| Script | Used by | What it does |
|---|---|---|
| `scripts/ci/summarize-results.mjs` | the pipeline, `repeat-suite` | Turns `.trx` and JUnit result files into the evidence table (passed, failed, skipped, not-run as separate columns). |
| `scripts/ci/quality-report.mjs` | `repeat-suite` | Aggregates runs into a pass-rate and flake report. |
| `scripts/ci/redis-touch.mjs` | the pipeline | Proves a test run really reached Redis (`snapshot`, then `assert`), because the adapter tests can silently use fakes. |

Where the commands came from: the per-project commands and test counts are in `CLAUDE.md`; the manual run-through of the stack is in `local-dev.md`; each script's header comment is the authority for its flags.
