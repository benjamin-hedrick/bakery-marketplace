# Architecture Decision Records

> **Status:** Current · the table and the by-concern view verified 2026-11-08 against the records (23 records, all Accepted except 0011, superseded)

One file per decision: `0001-title.md`, `0002-title.md`, and so on, in the format of `template.md`. The decision text of an ADR is never edited. Later changes are dated notes appended at the bottom ("Amendment note", "Validation outcome", "Current reading"), and the status line says only what the vocabulary in `docs/method/status-and-supersession.md` allows. The statuses below are also generated into `docs/product/backlog/STATUS.md`.

For the order in which the decisions were made and changed, see [the decision timeline](../decision-timeline.md).

## By concern

| Concern | Records | Reading order |
|---|---|---|
| Order lifecycle and fulfillment | 0001, 0017 | 0001 (the seam), then 0017 (stock ownership, which refines 0009) |
| Entry path and API gateway | 0008, 0013 | 0008 (the gateway), then 0013 (the BFF becomes the browser's entry; amends 0008) |
| Frontend | 0011, 0012 | 0012; 0011 is superseded and kept as the record |
| Caching | 0002, 0014 | 0002 (the server cache), then 0014 (three layers) |
| Events | 0003, 0021 | 0003 (the backbone), then 0021 (pushing changes to the vendor queue screen) |
| Data | 0004, 0017, 0022 | 0004, then 0017 (the stock counter and reservation records), then 0022 (tags: kinds, the registry, allergens) |
| Identity and authorization | 0006, 0018, 0019, 0023 | 0006 (users; read "Entra External ID" for "Azure AD B2C"), then 0018 (service callers), then 0019 (browser sessions) |
| Secrets, CI and delivery | 0007, 0015, 0020 | 0007, then 0015 (Azure Pipelines amends the CI secret storage), then 0020 (deployment pipeline, environments and configuration) |
| Observability | 0016 | |
| Payments | 0005 | |
| Service shape and language | 0009, 0010 | 0009 (13 contexts onto 4 services), 0010 (C# on .NET 10) |

## All records

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-fulfillment-strategy-extensibility.md) | Pickup v1; delivery deferred behind an Anticorruption Layer (events only) | Accepted, amended 2026-10-30 and 2026-11-07 |
| [0002](0002-cache-strategy.md) | Environment-conditional managed Redis with a local fallback | Accepted, amended 2026-09-11 to 2026-11-07 |
| [0003](0003-event-driven-backbone.md) | Event Grid (cloud) and Redis Streams (local); at-least-once delivery; per-aggregate sequencing | Accepted, amended 2026-10-30 and 2026-11-08 |
| [0004](0004-data-store-choice.md) | Cosmos DB, one container per bounded context | Accepted, amended 2026-10-30 and 2026-11-08 |
| [0005](0005-payments-buy-vs-build.md) | Stripe Connect (Express accounts) | Accepted |
| [0006](0006-auth-authz-model.md) | JWT validation by every service; role plus resource-ownership authorization; identity provider is Microsoft Entra External ID (the text says Azure AD B2C) | Accepted, amended 2026-09-11 to 2026-11-08 |
| [0007](0007-secrets-management.md) | Key Vault with managed identity; eliminate the secret where possible | Accepted, amended 2026-10-26 and 2026-10-28 |
| [0008](0008-api-gateway.md) | Azure API Management (Consumption) with zero-trust dual validation | Accepted, amended 2026-10-26 |
| [0009](0009-bounded-context-service-mapping.md) | 13 bounded contexts onto 4 services, modular-monolith rule | Accepted, noted 2026-11-08 |
| [0010](0010-service-language-framework.md) | C# and ASP.NET Core Web API; .NET 10 since 2026-10-28 | Accepted, amended 2026-10-28 and 2026-10-30 |
| [0011](0011-frontend-framework.md) | React (Vite) single-page app | Superseded by ADR-0012 |
| [0012](0012-frontend-nextjs-ssr.md) | Next.js Pages Router; server rendering for public listing pages | Accepted (2026-10-26) |
| [0013](0013-graphql-bff-relay.md) | Node/TypeScript GraphQL BFF with a Relay client as the browser's entry; C# services stay the domain authority | Accepted (2026-10-26) |
| [0014](0014-cache-layers.md) | Three owned cache layers: server (0002), Relay store, HTTP/CDN | Accepted (2026-10-26); the listing path recorded 2026-11-07 |
| [0015](0015-azure-pipelines-ci-cd.md) | Azure Pipelines is the pipeline; GitHub stays source control | Accepted (2026-10-26) |
| [0016](0016-opentelemetry-tracing.md) | OpenTelemetry with W3C `traceparent` as the only propagated correlation mechanism | Accepted (2026-10-26) |
| [0017](0017-stock-and-availability-ownership.md) | The catalog owns the stock counter; reserve at place, release on cancel | Accepted (2026-10-28) |
| [0018](0018-service-to-service-authentication.md) | OAuth2 client credentials for service callers; DEV credential type pending | Accepted (2026-10-31) |
| [0019](0019-browser-sessions.md) | A server-side session behind an HttpOnly cookie: renewal on the server, tokens out of the page, one implementation for both web apps | Accepted (2026-11-02) |
| [0020](0020-deployment-pipeline-and-environments.md) | Build once, promote by digest, configure at deploy time; two stacks; gated infrastructure and application stages; a second, never-run UAT/Prod pipeline | Accepted (2026-10-31), noted 2026-11-08 |
| [0021](0021-live-updates-to-the-vendor-queue.md) | Push as a nudge over a stream (GraphQL subscription over SSE, Redis Pub/Sub fan-out) layered on polling, which stays | Accepted (2026-11-02) |
| [0022](0022-tags.md) | Tags: a catalog-owned registry of kinds and tags (allergen, diet, occasion, season, theme), assigned to listings and options; visibility and windows enforced by the catalog | Accepted |
| [0023](0023-native-app-sign-in.md) | Native app sign-in: Authorization Code with PKCE in the system browser, a private-use redirect scheme, the refresh token in the Android Keystore; the BFF and services are unchanged | Accepted (2026-11-04) |

## What has been built, against these decisions

Notes at the bottom of each record say what was built, what was not, and where the code differs from the text. In short (read against the code and the work-item specs on 2026-11-08; everything runs locally, nothing is deployed):

- **Built and run:** the cache library (Redis, local, resilient and chaos providers) and the catalog's listing cache on top of it (ADR-0002, 0014, `WI-CAT-003`, In review); the Redis Streams transport with an outbox and relay in ordering, a consumer group per service and event type, and a consumer name so a strategy can be its own consumer (ADR-0001's note of 2026-11-07; `WI-ORD-003`, In review); Cosmos repositories on the vNext emulator; JWT middleware, ownership checks and a mock issuer with PKCE and a refresh grant (ADR-0006); client-credentials service callers (ADR-0018, phase 1); browser sessions in `packages/web-session` (ADR-0019); the GraphQL BFF and both Next.js apps (ADR-0012, 0013); the live vendor queue over a stream with polling kept (ADR-0021); tags and allergens (ADR-0022); the Android app's sign-in (ADR-0023); tracing (ADR-0016); stock reservation (ADR-0017); the build-once pipeline and two Terraform stacks, validated locally (ADR-0015, 0020).
- **Written, never run against the real thing:** the Terraform stacks (never applied to Azure), the second pipeline for UAT and production, and the DEV credential type of ADR-0018.
- **Not built:** the Event Grid transport, the chaos event transport (`EVT-004`), API Management, Entra External ID, Stripe, Key Vault wiring, a cache Redis wired into the deployed environment, and anything deployed.

Merging related records into concern chapters (for example 0002 with 0014) was considered and not done: the numbers are cited in specs, evidence and code comments, and the appended notes are part of the record. The by-concern table and the timeline do that job.

See `template.md` for the format.
