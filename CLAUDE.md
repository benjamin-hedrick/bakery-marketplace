# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A portfolio project: a pickup-based bakery/coffee marketplace, built to show architecture, product and engineering ownership. It is **mostly documentation plus shared C# libraries**. `catalog-service` has real listing endpoints (`WI-CAT-001`; in-memory backends by default, Cosmos and Redis verified against the local Compose stack). `ordering-service`, `admin-service` and `notification-service` are empty scaffolds (`Program.cs` only) and `docker-compose.yml` runs the local infrastructure (Redis Streams, Cosmos vNext emulator, mock OIDC issuer; `docs/operations/local-dev.md`) but no application containers. The only frontend code is the `WI-PORT-001` proof in `apps/web-customer` (Next.js + Relay against a mock GraphQL server); `web-admin` and `web-queue-display` are empty. Don't describe anything as working unless you've run it.

## Commands

.NET 10 (projects target `net10.0`; the `.slnx` format needs SDK 9+). There are two solutions:

- `BakeryMarketplace.slnx` (root): the 4 service projects, the 7 `tools/` libraries, and the catalog-service test project (`services/catalog-service/tests/`).
- `tools/BakeryMarketplace.slnx`: the 7 library test projects under `tools/tests/` (**not** the service tests; run those via their own path or the root solution).

```
dotnet build BakeryMarketplace.slnx
dotnet test tools/BakeryMarketplace.slnx
dotnet test tools/tests/BakeryMarketplace.Auth.Tests --filter "FullyQualifiedName~MockOidcIssuerTests"
dotnet test services/catalog-service/tests/CatalogService.Tests   # 28 tests; hosts the real service in-process
```

The framework is xUnit. The Redis and Cosmos adapter tests read `REDIS_CONNECTION_STRING` (default `localhost:6379`), and some fall back to in-memory fakes when Docker dependencies aren't running (reconciliation finding A8). A green run without Docker doesn't prove the real adapters work.

Frontend proof (`apps/web-customer`, Node 25.9.0 was used; exact LTS pin is still open). Run from that directory:

```
npm ci
npm run typecheck        # relay-compiler, then tsc
npm run build            # relay-compiler + next build
npm run mock             # mock GraphQL on :4000
ENABLE_TEST_HOOKS=1 npx next start -p 3000
npm run test:isolation   # 200 concurrent SSR requests, two fixtures
npm run test:e2e         # Playwright (Chromium); `npx playwright install chromium` first
npm run test:skeleton    # WI-PORT-002 smoke; needs the whole local stack (docs/operations/local-dev.md)
```

GraphQL BFF (`services/graphql-bff`, Node >=24, port 4100): `npm ci`, `npm run typecheck`, `npm test` (16 tests, no Docker needed), `CATALOG_URL=... npm start`. The GraphQL schema lives in `services/graphql-bff/schema/schema.graphql` and is also read by the Relay compiler.

Generated Relay artifacts (`src/__generated__/`) are gitignored; `npm run relay` recreates them. `ENABLE_TEST_HOOKS` must never be set outside tests. Details: `apps/web-customer/README.md`.

Local infrastructure (needs Docker; full guide and verification status in `docs/operations/local-dev.md`):

```
docker compose up -d --build                # redis-events, cosmos, mock-oidc
docker compose --profile with-redis up -d   # plus the cache Redis
node scripts/dev/check-env.mjs --wait 90    # exit 0 when up, 1 otherwise
docker compose down                         # resets all state
```

Run services on the host against these ports. The Cosmos emulator needs Cosmos SDK 3.63.x+ (older versions fail on whole-document queries), and the existing `CosmosRepositoryTests` skip silently by default and fail against the real emulator (open item #31).

Docs site: `mkdocs.yml` (Material theme, `docs_dir: docs`). mkdocs isn't installed here, so the nav is unbuilt.

Formatting and linting (decided 2026-10-28, `docs/process/quality-gates.md`): `dotnet format whitespace|style BakeryMarketplace.slnx` for C#; in `apps/web-customer` and `services/graphql-bff`, `npm run format` (Prettier) and `npm run lint` (ESLint). Run the `--verify-no-changes` / `format:check` variants before pushing. CI is Azure Pipelines only (ADR-0015; the GitHub `ci.yml` placeholder was removed 2026-10-28, and the Azure check is a soft manual gate, not a required check). `azure-pipelines.yml` exists (`WI-PORT-003`) and has run green on Azure DevOps (reported by the human lead 2026-10-28, with the Cosmos-adapter warning; not yet verified on `ubuntu-26.04`); commands, gaps and the results format are in `docs/process/quality-gates.md`. `node scripts/ci/skeleton-smoke.mjs` runs the whole real stack plus the Playwright smoke locally. Set `REDIS_CONNECTION_STRING=127.0.0.1:6379` when running the Redis adapter tests: with `localhost` they can silently use fakes.

## Architecture (needs several files to see)

**Decisions live in `docs/architecture/adr/` (0001–0016).** Read the ADR index first. Amendments are appended as dated notes at the bottom of the ADR, never by rewriting its decision text. Superseded ADRs stay in place with a status line (ADR-0011 is superseded by ADR-0012).

**Target shape (ADR-0012/0013, adopted 2026-10-26, not yet built):** Next.js Pages Router apps (SSR only for public listing pages) → Node/TypeScript GraphQL BFF with a Relay client → C# REST services. In the cloud the BFF calls services through Azure API Management; locally it calls them directly. **C# services own all business rules, pricing, availability and order state; the BFF is composition and error mapping only.** Don't put domain logic in the BFF or let the GraphQL schema become a second domain model.

**Services (ADR-0009):** 13 bounded contexts are grouped onto 4 services (`catalog`, `ordering`, `admin`, `notification`) under a modular-monolith rule: co-located contexts still talk through the same interfaces and events they would use if they were separate.

**`tools/` shared libraries follow an adapter + fallback + contract-test pattern**, and new infrastructure code should too: an interface (`ICacheProvider`, `IRepository<T>`, `IEventPublisher`/`IEventSubscriber`), a real and a local/fake implementation, a shared abstract contract-test base that every implementation inherits (e.g. `CacheProviderContractTests`), and a chaos decorator where resilience matters. Auth, secrets and payments deliberately sit outside this pattern (ADR-0005/0006/0007).

**Caching is three layers (ADR-0014):** the server cache is ADR-0002's `ICacheProvider` + `ResilientCacheProvider` (built and tested). Relay's client store and HTTP/CDN caching are governed by ADR-0014. Authenticated or personalized responses default to `private, no-store`. Order and cart data is never cached.

**Correlation (ADR-0016):** W3C `traceparent` is the only propagated mechanism. `X-Correlation-Id` becomes a response-only alias of the trace ID. The existing `CorrelationIdMiddleware` still trusts an inbound header; changing that is `WI-PORT-005`.

**Auth:** `tools/BakeryMarketplace.Auth` holds the JWT/ownership middleware and a local mock OIDC issuer (PKCE). Every service validates tokens and ownership itself, even behind the gateway (zero trust, ADR-0006/0008).

## Working conventions

- No secrets in files
- **Work items are the unit of work.** Specs are `docs/product/backlog/WI-*.md`; commits map to one work item (say which in the message), while a branch and PR may group several related work items and is named for the theme (e.g. `feature/slice-ordering`; `feature/<WI-ID>-short-description` still fits a single item). Trunk-based, `docs/process/branching-strategy.md`. To limit conflicts: rebase on `origin/main` before pushing, check `git status` before `git add -A`, and keep shared-file edits (log, register, outline) to one branch at a time. Start from `docs/project-log.md` and the On Deck section of `MASTER-BACKLOG-OUTLINE.md`.
- **Don't rewrite historical `WI-*.md` specs.** Record supersession or adjustment as a dated reconciliation note at the top of the file, and mark it in `MASTER-BACKLOG-OUTLINE.md`. **That outline, not the `Status:` field in a WI file, is authoritative for status** (many WI headers are stale).
- **Reconciliation records** go in `docs/product/backlog/worklog/reconciliation/RECONCILIATION-DISPOSITIONS-<date>.md`. `docs/ACTIVITY-LOG.md` (newest first, don't edit history) is **paused for new entries from 2026-10-28** because every branch prepends to the same lines and conflicts; its role is being rethought (open item 50). Until then put what happened in commit messages and the PR description, and unresolved items in the register.
- Shared-file edits (schema, lockfile, root config, pipeline YAML, central docs) need a single owner at a time: `docs/management/portfolio-slice/07-shared-file-ownership-and-coordination.md`.
- **Unreconciled items go in `docs/governance/open-items-register.md`** (the running list) in the same change that finds them, so nothing is dropped and later sessions don't re-analyze it. Mark resolved items `Resolved <date>`; don't delete them.
- Cosmos access uses parameterized queries via the SDK only; no raw query string construction (`nfrs.md` §3.4).
- Report passed, failed, not-run and blocked results distinctly. Don't claim an endpoint, pipeline or deployment is operational without evidence.
- `_incoming/` is a transient staging folder for packets awaiting reconciliation; don't treat its contents as repo truth.
- `.claude/settings.json` denies reads of `dist/`, `build/`, `*.generated.*` and `vendor/`.

## Human approval required
Security, auth logic, IAM/RBAC changes
Before expanding scope of work item or refactoring code