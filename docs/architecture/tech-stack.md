# Tech Stack Overview

This is a reference document, not an ADR — it indexes the decisions made across ADR-0001 through ADR-0016 (ADR-0011 superseded by ADR-0012) and links out to each for full rationale.

## Guiding principles

1. **Free-tier-first for dev/demo**, environment-conditional for anything with real cost — established for caching (ADR-0002) and should be the default pattern for any component with a paid tier.
2. **Same toggle, same name, everywhere** — a config value like `CACHE_BACKEND` means the same thing in Terraform, Compose, and app config. Reduces cognitive load and documentation drift.
3. **Adapter + fallback over hard dependency** — anything with an external/paid backend gets an interface, a local/no-cost implementation, and (where it matters for resilience) a circuit-breaker fallback. Applied to caching (ADR-0002), the event backbone (ADR-0003), and data access (ADR-0004).
4. **OIDC over long-lived secrets** for CI/CD → cloud auth.
5. **Eliminate a secret before managing it well.** Where an Azure service supports Azure AD RBAC via managed identity (e.g., Cosmos DB), that's preferred over a connection-string secret in Key Vault — a secret that doesn't exist can't leak. Key Vault is for the cases where a secret genuinely can't be avoided (Stripe, Basic-tier Redis) — see ADR-0007.

## Cloud stack (Azure)

| Concern | Technology | Tier | Status |
|---|---|---|---|
| Compute (services) | Azure Container Apps | Consumption plan, permanent free grant | Confirmed |
| Frontend framework | React + TypeScript + Next.js (Pages Router), SSR for public listing pages; Relay client | — | Confirmed — see ADR-0012 (supersedes ADR-0011); validation pending `WI-PORT-001` |
| Frontend hosting | Node-capable host required (Next.js SSR) — Azure Container Apps is the default candidate; **Static Web Apps no longer fits** (ADR-0012) | Container Apps consumption free grant (to confirm) | Open — decide when deployment is introduced (`INFRA-002`) |
| GraphQL BFF | Node.js/TypeScript GraphQL server; browser apps' single API entry point; calls C# services via APIM in cloud, directly locally | Container Apps (same as services) | Confirmed — see ADR-0013 |
| Event backbone | Azure Event Grid | Permanent free grant (100k ops/mo) | Confirmed — see ADR-0003 |
| Primary data store | Azure Cosmos DB (SQL API), container-per-bounded-context | Permanent free tier: 1000 RU/s + 25GB (single shared account) | Confirmed — see ADR-0004 |
| Cache | Azure Cache for Redis, environment-conditional — **vendor under reconsideration, see open item #22** | Basic tier (no permanent free tier) | Confirmed (abstraction) — see ADR-0002 |
| Observability | OpenTelemetry instrumentation + W3C Trace Context; Application Insights + Azure Monitor as cloud backend (Azure Monitor OTel exporter); local trace viewer for dev | Free 5GB/month ingestion | Confirmed — see ADR-0016 |
| Auth | Microsoft Entra External ID (successor to Azure AD B2C, which stopped accepting new tenants May 2025) | Free tier — exact figures pending verification | Confirmed — see ADR-0006 amendment note |
| Language / Framework | C# / .NET 8, ASP.NET Core Web API | — (dev tooling, not a paid service) | Confirmed — see ADR-0010 |
| Payments | Third-party processor — Stripe Connect (Express accounts) | N/A (external) | Confirmed — see ADR-0005 |
| Secrets management | Azure Key Vault, per-environment, accessed via managed identity (no stored credential to reach it) | Free tier covers this scale (charged per operation, negligible cost) | Confirmed — see ADR-0007 |
| API Gateway | Azure API Management, Consumption tier, zero-trust dual validation (edge fast-fail + authoritative per-service check) | Permanent free grant (1,000,000 calls/mo) | Confirmed — see ADR-0008 |
| IaC | Terraform, `azurerm` provider | — | Confirmed |
| Source control | GitHub | — | Confirmed |
| CI/CD | Azure Pipelines, workload identity federation to Azure (no stored secrets) — **migration in progress**; `.github/workflows/ci.yml` placeholder stays until ADR-0015's exit criteria are met | — | Confirmed — see ADR-0015 |
| IaC environment structure | Per-environment `.tfvars` in `/infra/environments` (`dev`, `staging`, `prod`) | — | Confirmed |

## Caching — environment-conditional design (see ADR-0002)

Two independent switches:
- **Deploy-time (Terraform):** `enable_managed_redis` var, gates whether `azurerm_redis_cache` is provisioned at all (`false` in `dev.tfvars`, `true` in `staging`/`prod`)
- **Runtime (app):** `CacheProvider` interface with `RedisCacheProvider` and `LocalCacheProvider` implementations, selected via `CACHE_BACKEND` config, wrapped in a `ResilientCacheProvider` that circuit-breaks to `LocalCacheProvider` on failure regardless of configured backend

Full rationale, Terraform snippets, and testing/chaos design land in ADR-0002.

## Local development stack

Local dev runs entirely via `docker-compose`. Not everything is optional the way caching is — the event backbone and data store are core function, so they're part of the **default service set**; only the cache is genuinely opt-in via a Compose profile.

| Concern | Local implementation | Included by default? | Fakes / chaos support |
|---|---|---|---|
| Cache | `LocalCacheProvider` (in-process) by default; real Redis via `--profile with-redis` | No — Redis is opt-in; local fallback is always available regardless | `FakeCacheProvider` (unit tests); `ChaosCacheProvider` decorator injects latency/errors/outage windows to prove circuit-breaker fallback (ADR-0002) |
| Event backbone | Redis Streams container | **Yes** — default service, not profile-gated (ADR-0003) | Contract-test suite runs against both Redis Streams and Event Grid to catch behavioral drift; `ChaosEventTransport` injects duplicate/out-of-order/delayed/dropped delivery (ADR-0003) |
| Data store | Cosmos DB Linux emulator container | **Yes** — default service (ADR-0004); known to be resource-heavier than the other local services | `FakeRepository` (fast unit tests, bypasses the emulator entirely); contract tests run against the emulator for integration-level parity checks (ADR-0004) |
| Payments | Stripe test mode + Stripe CLI (`stripe listen --forward-to`) forwarding real webhook events to a local endpoint | External SaaS — not a Compose service; no emulator needed (ADR-0005) | Stripe's own test-mode fixtures/test cards; webhook idempotency exercised by replaying Stripe's test events |
| Auth | Local stub/mock OIDC issuer (config-driven issuer/JWKS URL swap, not a runtime fallback), no real Entra External ID dependency | Yes | Deterministic tests only (expired/tampered/malformed tokens) — no live chaos decorator, since auth has no fallback behavior to prove (ADR-0006) |
| API Gateway | Skip locally; the BFF calls services directly (safe under zero-trust dual validation). The reverse-proxy stand-in is no longer needed now that browser apps only talk to the BFF (ADR-0013) | No | Static policy-config lint in CI (no live instance needed); real policy testing happens against a shared dev-tier cloud APIM instance, same shape as Stripe's test-mode approach (ADR-0008) |
| Secrets | Git-ignored `.env` file with Stripe **test-mode** keys; no Key Vault dependency locally at all | Yes | Fail-fast startup validation tests (missing/malformed secret → refuse to start), not a live chaos decorator — no meaningful degraded mode for "can't get the Stripe key" (ADR-0007) |
| Seed data | Fixture/seed script run on `docker-compose up` | Yes | — |
| Web apps + BFF | Next.js dev server(s) and the GraphQL BFF (ADR-0012/0013) — Compose wiring tracked in `WI-DEV-002` (adjusted) | Yes, once built | Contract tests between BFF and C# APIs (`WI-PORT-007`) |
| Tracing | Local OpenTelemetry trace viewer (Jaeger or .NET Aspire dashboard — chosen in `WI-PORT-005`) | Yes, once built | — |

Default command: `docker-compose up` — brings up the event backbone (Redis Streams) and data store (Cosmos emulator) automatically, since both are non-optional local dependencies per ADR-0003/ADR-0004. Still zero cost and fully offline-capable; only the managed-Redis cache path requires an extra flag.
Extended command: `docker-compose --profile with-redis up` — additionally exercises the real Redis cache path before it hits staging.

## Cross-cutting patterns (apply across caching, eventing, and data access)

- **Adapter/Strategy interfaces** for any swappable backend — `CacheProvider` (ADR-0002), `EventPublisher`/`EventSubscriber` (ADR-0003), `Repository<T>` (ADR-0004)
- **Contract test suites** run against every implementation of an interface, to catch behavioral drift between adapters (e.g., local vs. cloud cache, Redis Streams vs. Event Grid, fake vs. real Cosmos)
- **Chaos/fault-injection decorators** (`ChaosCacheProvider`, `ChaosEventTransport`) that wrap a real provider to inject latency, forced errors, duplicate/out-of-order delivery, and outage windows — used in tests to prove fallback/circuit-breaker and idempotency behavior actually works. Structurally disabled in production via config validation at startup, not just "off by default."
- Fault-injection harness planned as a small shared `/tools` package so caching and eventing don't duplicate the pattern.
- Payments (ADR-0005), secrets retrieval (ADR-0007), and the API Gateway (ADR-0008) deliberately sit outside this pattern — Stripe isn't a swappable backend with a local/cloud adapter pair, Container Apps' native Key Vault secret references make application code environment-agnostic without needing a custom adapter, and APIM's policy language has no local-emulator equivalent to adapt against (mitigated instead by a reverse-proxy stand-in + cloud-dev-instance testing, per ADR-0008).

## Open decisions

All ADRs through ADR-0010 were accepted in the original planning pass: ADR-0001 (fulfillment strategy extensibility), ADR-0002 (cache strategy), ADR-0003 (event-driven backbone), ADR-0004 (data store choice), ADR-0005 (payments buy-vs-build), ADR-0006 (auth/authz model), ADR-0007 (secrets management), ADR-0008 (API gateway), ADR-0009 (bounded-context-to-service mapping), and ADR-0010 (service language/framework).

**Two planned tech swaps in progress, not yet executed** — see `docs/governance/open-items-register.md` items #21 (Azure AD B2C → Entra External ID) and #22 (Redis vendor reconsideration). Neither changes any ADR's actual design; both are held from AI-agent assignment until finalized — see `docs/product/backlog/MASTER-BACKLOG-OUTLINE.md`'s Agent-Ready Queue.

**2026-10-26 portfolio-slice decisions** — ADR-0012 (Next.js SSR, supersedes ADR-0011), ADR-0013 (GraphQL BFF + Relay), ADR-0014 (cache layers), ADR-0015 (Azure Pipelines), ADR-0016 (OpenTelemetry). Frontend hosting is the one row above left open, to be decided when deployment is introduced. See `docs/product/backlog/worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

No other open architectural decisions remain from the original planning pass. Next steps move from planning into backlog/sprint scoping and actual build.
