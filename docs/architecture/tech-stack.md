# Tech Stack Overview

This is a reference document, not an ADR — individual decisions below are either already settled here or flagged as **Pending ADR**, in which case this doc will be updated to link to the decision once it's written.

## Guiding principles

1. **Free-tier-first for dev/demo**, environment-conditional for anything with real cost — mirrors the cache design (ADR-0002, pending) and should be the default pattern for any component with a paid tier.
2. **Same toggle, same name, everywhere** — a config value like `CACHE_BACKEND` means the same thing in Terraform, Compose, and app config. Reduces cognitive load and documentation drift.
3. **Adapter + fallback over hard dependency** — anything with an external/paid backend gets an interface, a local/no-cost implementation, and (where it matters for resilience) a circuit-breaker fallback. Not just caching — this is the default posture for the event backbone and data store too, evaluated case by case.
4. **OIDC over long-lived secrets** for CI/CD → cloud auth.

## Cloud stack (Azure)

| Concern | Technology | Tier | Status |
|---|---|---|---|
| Compute (services) | Azure Container Apps | Consumption plan, permanent free grant | Confirmed |
| Frontend hosting | Azure Static Web Apps | Free tier, permanent | Confirmed |
| Event backbone | Azure Event Grid (leading candidate) vs. Service Bus | Permanent free grant (Event Grid: 100k ops/mo) | **Pending ADR-0003** |
| Primary data store | Azure Cosmos DB (SQL API), container-per-bounded-context | Permanent free tier: 1000 RU/s + 25GB (single shared account) | Confirmed — see ADR-0004 |
| Cache | Azure Cache for Redis, environment-conditional | Basic tier (no permanent free tier) | **Pending ADR-0002** — see Caching section below |
| Observability | Application Insights + Azure Monitor | Free 5GB/month ingestion | Confirmed |
| Auth | Azure AD B2C | Free up to 50,000 MAU | **Pending ADR** (auth model) |
| Payments | Third-party processor (e.g., Stripe Connect) — not self-built | N/A (external) | **Pending ADR** (payments buy-vs-build) |
| IaC | Terraform, `azurerm` provider | — | Confirmed |
| CI/CD | GitHub Actions, OIDC federated login to Azure (no stored secrets) | — | Confirmed |
| IaC environment structure | Per-environment `.tfvars` in `/infra/environments` (`dev`, `staging`, `prod`) | — | Confirmed |

## Caching — environment-conditional design (detail pending ADR-0002)

Two independent switches:
- **Deploy-time (Terraform):** `enable_managed_redis` var, gates whether `azurerm_redis_cache` is provisioned at all (`false` in `dev.tfvars`, `true` in `staging`/`prod`)
- **Runtime (app):** `CacheProvider` interface with `RedisCacheProvider` and `LocalCacheProvider` implementations, selected via `CACHE_BACKEND` config, wrapped in a `ResilientCacheProvider` that circuit-breaks to `LocalCacheProvider` on failure regardless of configured backend

Full rationale, Terraform snippets, and testing/chaos design land in ADR-0002.

## Local development stack

Local dev runs entirely via `docker-compose`, using **Compose profiles** to mirror the cloud's environment-conditional design rather than introducing a separate mental model:

| Concern | Local default | Optional profile |
|---|---|---|
| Cache | `CACHE_BACKEND=local` (in-process), no container | `--profile with-redis` → real Redis container, `CACHE_BACKEND=redis` |
| Event backbone | Lightweight in-process/local bus or Redis Streams container (final choice with ADR-0003) | — |
| Data store | Local container of whatever ADR chooses (e.g., Cosmos DB emulator or Postgres) | — |
| Auth | Local stub/mock auth provider, no real Azure AD B2C dependency | — |
| Seed data | Fixture/seed script run on `docker-compose up`, gives a realistic local dataset without manual setup | — |

Default command: `docker-compose up` — zero external dependencies, zero cost, works offline.
Extended command: `docker-compose --profile with-redis up` — exercises the real Redis path before it hits staging.

## Cross-cutting patterns (apply beyond caching wherever relevant)

- **Adapter/Strategy interfaces** for any swappable backend (cache, and likely event transport)
- **Contract test suites** run against every implementation of an interface, to catch behavioral drift between adapters (e.g., local vs. Redis cache behaving subtly differently)
- **Chaos/fault-injection decorators** (e.g., `ChaosCacheProvider`) that wrap a real provider to inject latency, forced errors, and outage windows — used in tests to prove fallback/circuit-breaker behavior actually works. Structurally disabled in production via config validation at startup, not just "off by default."
- Fault-injection harness planned as a small shared `/tools` package so caching and eventing don't duplicate the pattern.

## Open decisions (pending ADRs)

1. Auth/authz model (Azure AD B2C configuration, role model)
2. Payments buy-vs-build (Stripe Connect or similar)

ADR-0001 (fulfillment strategy extensibility), ADR-0002 (cache strategy), ADR-0003 (event-driven backbone), and ADR-0004 (data store choice) are already accepted.
