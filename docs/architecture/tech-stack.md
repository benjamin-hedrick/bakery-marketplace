# Tech Stack Overview

> **Status:** Current · rewritten 2026-10-30. A reference, not an ADR: it indexes the decisions in ADR-0001 to ADR-0018 (ADR-0011 is superseded by ADR-0012, ADR-0018 is Proposed) and says, per row, whether the decision is built. "Decision" is what the ADRs settle; "Build state" is what exists in this repository and was run locally. Nothing is deployed.

## Guiding principles

1. **Free-tier-first for dev/demo**, environment-conditional for anything with real cost (established for caching, ADR-0002).
2. **Same toggle, same name, everywhere:** a config value such as `CACHE_BACKEND` means the same thing in Terraform, Compose and app config.
3. **Adapter and fallback over hard dependency:** anything with an external or paid backend gets an interface, a local implementation and, where resilience matters, a fallback. The pattern, where it is applied and how it is verified are in [patterns](patterns.md).
4. **OIDC over long-lived secrets** for CI/CD to cloud auth (intended; nothing is deployed yet).
5. **Eliminate a secret before managing it well.** Where an Azure service supports managed identity (for example Cosmos DB), prefer it to a connection string in Key Vault; Key Vault is for secrets that cannot be avoided (Stripe, a Basic-tier Redis). ADR-0007.

## Stack, by concern

| Concern | Technology | Decision | Build state (2026-10-30) |
|---|---|---|---|
| Services | C# on .NET 10, ASP.NET Core Web API | ADR-0010 (amended 2026-10-28 from .NET 8) | `catalog-service` and `ordering-service` built; `admin-service` and `notification-service` are empty scaffolds |
| Compute hosting | Azure Container Apps (consumption plan) | Confirmed, no ADR | Not built; no container images exist (register 71) |
| Frontend | React, TypeScript, Next.js Pages Router; server rendering for public listing pages; Relay client | ADR-0012 (supersedes 0011) | `apps/web-customer` implements slice 1; `web-admin` and `web-queue-display` are empty |
| Frontend and BFF hosting | A Node-capable host (Static Web Apps no longer fits); Container Apps is the default candidate | Open (register 25) | Not built |
| GraphQL BFF | Node.js and TypeScript; the browser's only API entry point; calls services directly locally, through APIM in the cloud | ADR-0013 | Built (`services/graphql-bff`) |
| Event backbone | Azure Event Grid (cloud), Redis Streams (local) | ADR-0003 | Redis Streams transport and an outbox in ordering are built; Event Grid and the chaos transport are not |
| Primary data store | Azure Cosmos DB (SQL API), one container per bounded context | ADR-0004 | Repositories built and run against the vNext emulator; no Azure Cosmos account; containers `catalog` and `orders` only |
| Cache | Managed Redis, environment-conditional; the vendor is under reconsideration (register 22) | ADR-0002, ADR-0014 | The `tools` library is built and tested; no service uses a cache yet |
| Observability | OpenTelemetry with W3C Trace Context; OpenTelemetry Collector to Application Insights in the cloud | ADR-0016 | Instrumented in the BFF, the web server and both services; local collector, Aspire and Jaeger as compose profiles; Application Insights not built (register 37) |
| Auth | Microsoft Entra External ID (successor to Azure AD B2C); service callers use OAuth2 client credentials | ADR-0006 (amended), ADR-0018 (Proposed) | A mock OIDC issuer and the shared validation middleware are built; Entra is not configured; the DEV credential type is open (register 62) |
| Payments | Stripe Connect (Express accounts) | ADR-0005 | A named stub only (`IPaymentProcessor`); no Stripe code |
| Secrets | Azure Key Vault via managed identity | ADR-0007 | A Terraform module exists in `infra/modules/key_vault`; never planned or applied; services read config and a git-ignored `.env` |
| API gateway | Azure API Management, Consumption tier, with every service still validating tokens itself | ADR-0008 (amended by 0013) | Not built |
| Infrastructure as code | Terraform (`azurerm`), per-environment folders `dev`, `staging`, `prod` under `infra/environments` | Confirmed, no ADR | The Key Vault module only |
| Source control | GitHub | Confirmed | In use |
| CI/CD | Azure Pipelines (`azure-pipelines.yml`); GitHub stays source control | ADR-0015 | The pipeline exists and the lead reported a green run on 2026-10-29; it is a soft manual gate, not a required check; no deployment stage |

## Local development stack

Local development runs through `docker compose` plus services on the host (`docs/operations/local-dev.md` has the verified steps and status). The event backbone and the data store are core function, so they are in the default service set.

| Concern | Local implementation | Default? | Fakes and chaos support |
|---|---|---|---|
| Event backbone | Redis Streams container | Yes | In-memory transport; `EventTransportContractTests` run against it and Redis Streams; the chaos transport is not built |
| Data store | Cosmos DB **vNext** emulator container (the Linux emulator named in older text is not used); needs Cosmos SDK 3.63.x or later | Yes | Fake repository for fast unit tests; contract tests against the emulator when `COSMOS_CONNECTION_STRING` is set |
| Cache | In-process `LocalCacheProvider`; real Redis under `--profile with-redis` | No | `ChaosCacheProvider` and the resilient fallback |
| Identity | Mock OIDC issuer container (PKCE for users, client credentials for services) | Yes | Deterministic tests only (expired, tampered, malformed tokens); no chaos decorator because auth has no fallback to prove |
| Payments | The stub; Stripe test mode and Stripe CLI are not wired (no spec; backlog N-08) | n/a | |
| API gateway | None; the BFF calls the services directly | n/a | Policy lint is planned for when APIM exists |
| Secrets | Git-ignored `.env` written by `node scripts/dev/init-env.mjs` | Yes | Fail-fast startup validation tests |
| Seed data | `tools/BakeryMarketplace.Seed`, run by hand or by the smoke script; it also publishes `VendorVerified` | On demand | |
| Web app and BFF | Started on the host (`npm`); not in compose | n/a | Contract tests between the BFF and the services |
| Tracing | OTLP to the OpenTelemetry Collector; Aspire dashboard (`--profile tracing`), collector (`--profile collector`), Jaeger (`--profile jaeger`) | Opt-in | |

Commands: `docker compose up -d --build` starts Redis Streams, the Cosmos emulator and the mock issuer; add `--profile with-redis` for the cache Redis. Application containers do not exist; run the services on the host against the compose ports (see `docs/operations/local-dev.md`).

## Cross-cutting patterns

Adapter interfaces, contract-test suites run against every implementation, and chaos decorators are described, with their current coverage and the places they are not applied, in [patterns](patterns.md). Payments, secrets retrieval and the API gateway deliberately sit outside the adapter pattern (ADR-0005, 0007, 0008). There is no shared fault-injection package: the chaos decorators are per library, and only `ChaosCacheProvider` exists.

## Open decisions

- Where the Next.js server and the BFF run (register 25).
- The managed cache vendor (register 22); `CACHE-005`, the Terraform toggle, is held for it.
- The DEV credential type for service-to-service authentication, per the verification list in ADR-0018 (register 62).
- The Entra External ID tenant and its app registrations (register 21, backlog N-02).
- Everything else the ADRs decide is decided; build progress is in the table above and in `docs/product/backlog/STATUS.md`.
