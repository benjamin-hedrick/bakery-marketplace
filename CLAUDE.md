# CLAUDE.md

Guidance for Claude Code in this repository. Keep it short: it is sent with every request. Dated status belongs in the generated and planning documents named below, not here.

## What this repo is

A portfolio project: a pickup-based bakery and coffee marketplace, built to show architecture, product and engineering ownership. C# services (`catalog`, `ordering`, `notification`; `admin` is an empty scaffold), a Node/TypeScript GraphQL BFF, a customer web app, a vendor queue display, an Android customer app, shared libraries in `tools/` and `packages/`, and a large body of documentation. **Everything runs locally only; nothing is deployed.** Don't describe anything as working unless you've run it.

Where the current state lives (read these, don't restate them here): `docs/product/backlog/STATUS.md` (generated from the spec banners), `docs/product/backlog/current-plan.md`, `docs/governance/open-items-register.md`, `docs/operations/local-dev.md`, `docs/operations/scripts.md` (every script and command).

## Commands

.NET 10 (`.slnx` needs SDK 9+). Two solutions: `BakeryMarketplace.slnx` (services, `tools/`, the three service test projects) and `tools/BakeryMarketplace.slnx` (the library test projects under `tools/tests/`, not the service tests).

```
dotnet build BakeryMarketplace.slnx
dotnet test tools/BakeryMarketplace.slnx
dotnet test services/<catalog|ordering|notification>-service/tests/<Name>Service.Tests
dotnet format whitespace|style BakeryMarketplace.slnx   # also tools/BakeryMarketplace.slnx; --verify-no-changes before pushing
```

- Redis and Cosmos tests: set `REDIS_CONNECTION_STRING=127.0.0.1:6379` (with `localhost` they can silently use fakes) and `COSMOS_CONNECTION_STRING` (the Cosmos tests are skipped without it and fail if it is set and the emulator is unreachable). A green run without Docker doesn't prove the real adapters work. The emulator needs Cosmos SDK 3.63.x or later.
- Local infrastructure (Docker): `docker compose up -d --build` (Redis Streams, Cosmos vNext emulator, mock OIDC issuer); `--profile with-redis` adds the cache Redis, `--profile apps` the application containers. `node scripts/dev/init-env.mjs` creates the git-ignored `.env`; `node scripts/dev/check-env.mjs --wait 90` checks the stack; `docker compose down` resets all state.
- The whole stack on the host: `node scripts/dev/demo.mjs` (demo), `node scripts/ci/skeleton-smoke.mjs` (Playwright journeys against the real services). `STACK_CHAOS_SCENARIO=<name>` before either runs it under a chaos scenario (`chaos/README.md`).
- Node packages and apps (each: `npm ci`, `npm run typecheck`, `npm test`, `npm run format:check`, `npm run lint` where the package has them; run `npm ci` in `packages/web-session`, `packages/chaos` and `packages/customer-core` before the apps and the BFF that link them): `services/graphql-bff` (Node >=24, port 4100), `apps/web-customer` (`npm run test:e2e` is Playwright; `npm run relay` makes the gitignored `src/__generated__`), `apps/web-queue-display`, `apps/mobile-customer` (Android, Maestro flows run by `node scripts/dev/mobile-flows.mjs`), `packages/chaos`, `packages/customer-core`, `packages/web-session`.
- **Before every push:** `node scripts/ci/node-gates.mjs` (format, lint, typecheck, docs status, traceability and link checks; `--tests` adds the unit tests) and `node scripts/ci/secret-scan.mjs` (Docker). `node scripts/ci/linux-check.mjs` runs the .NET tests on Linux in a limited container (CI is Ubuntu, development is Windows; tests must not block on tasks). `node scripts/ci/terraform-checks.mjs` for `infra/`.
- `ENABLE_TEST_HOOKS` must never be set outside tests. `mkdocs` isn't installed here, so the docs nav is unbuilt. CI is Azure Pipelines only (ADR-0015).

## Architecture (needs several files to see)

**Decisions live in `docs/architecture/adr/`.** Read the ADR index first. Amendments are appended as dated notes at the bottom of an ADR, never by rewriting its decision text; a superseded ADR stays in place with a status line.

- **Shape (ADR-0012/0013):** Next.js Pages Router apps → Node/TypeScript GraphQL BFF (Relay client) → C# REST services. In the cloud the BFF calls services through API Management; locally it calls them directly. **C# services own all business rules, pricing, availability and order state; the BFF is composition and error mapping only.** Don't put domain logic in the BFF or let the GraphQL schema become a second domain model. The schema is `services/graphql-bff/schema/schema.graphql`, also read by the Relay compiler.
- **Services (ADR-0009):** 13 bounded contexts grouped onto 4 services under a modular-monolith rule: co-located contexts still talk through the interfaces and events they would use if separate.
- **`tools/` libraries follow adapter + fallback + contract test**, and new infrastructure code should too: an interface (`ICacheProvider`, `IRepository<T>`, `IEventPublisher`), a real and a local/fake implementation, a shared abstract contract-test base every implementation inherits, and where resilience matters a chaos layer (seeded scenario files in `chaos/scenarios/`, ADR-0024, `chaos/README.md`; local Development and dev only). Auth, secrets and payments sit outside this pattern (ADR-0005/0006/0007).
- **Caching has three layers (ADR-0014).** Authenticated or personalized responses default to `private, no-store`. Order and cart data is never cached.
- **Correlation (ADR-0016):** W3C `traceparent` is the only propagated mechanism; `X-Correlation-Id` is a response-only alias of the trace id.
- **Auth:** `tools/BakeryMarketplace.Auth` holds the JWT and ownership middleware and the local mock OIDC issuer (PKCE). Every service validates tokens and ownership itself, even behind the gateway (zero trust, ADR-0006/0008).

## Working conventions

- No secrets in files.
- **Work items are the unit of work.** Specs are `docs/product/backlog/WI-*.md`; a commit maps to one work item (say which in the message); a branch and PR may group related items and is named for the theme. Trunk-based (`docs/process/branching-strategy.md`). Rebase on `origin/main` before pushing, check `git status` before `git add -A`, keep shared-file edits (register, `STATUS.md` inputs, `epic-catalog.md`, `mkdocs.yml`) to one branch at a time.
- **Pushing and PRs.** Push only when the lead asks, and never to a branch with an open PR or under review unless asked. A pasted check failure or log is a request to fix locally and report, not to push: reproduce each failure, run every pipeline gate against the final tree (`docs/process/branching-strategy.md` step 3), say what passed, and push once when agreed. The lead opens and merges PRs; don't open one. `git push` runs as its own command.
- **Keep specs accurate, and never edit ADR decision text.** The status banner on line 1 of a spec is authoritative; `STATUS.md` is generated from the banners (`node scripts/docs/status.mjs`, `--check` to verify; run it after changing a banner or an ADR status line). Rules for status words, notes and supersession: `docs/method/status-and-supersession.md`.
- **Unreconciled items go in `docs/governance/open-items-register.md`** in the same change that finds them. Mark resolved items `Resolved <date>`; don't delete them. Reconciliation records go in `docs/product/backlog/reconciliation/`. The activity log is closed (`docs/history/`); put what happened in commit messages and the PR description.
- **Don't build functionality only to close a gap in testing** (an endpoint, flag, hook or branch that exists so a test can reach something). Use **data**: a new named seed data point, a fixture, or interfaces that already exist. If a test truly needs something new, ask first and say plainly that it is test-only. Existing test-only mechanisms (the Android flows' control server, the web app's `x-fixture` and `x-delay-ms` headers) are on the register for review, not to be extended.
- Cosmos access uses parameterized queries via the SDK only (`nfrs.md` §3.4).
- Report passed, failed, not-run and blocked results distinctly. Don't claim an endpoint, pipeline or deployment is operational without evidence.
- `_incoming/` is transient staging, not repo truth. `.claude/settings.json` denies reads of `dist/`, `build/`, `*.generated.*` and `vendor/`.
- **Shell edits:** no files or multi-line scripts through a heredoc. Write documents with the Write tool; write an edit script to a file and run it (assert each target occurs exactly once); use Edit for single changes.

## Human approval required

Security, auth logic, IAM/RBAC changes. Before expanding the scope of a work item or refactoring code.
