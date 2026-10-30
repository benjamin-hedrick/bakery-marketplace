# Architecture Decision Records

> **Status:** Current · verified 2026-10-30

One file per decision: `0001-title.md`, `0002-title.md`, and so on, in the format of `template.md`. The decision text of an ADR is never edited. Later changes are dated notes appended at the bottom ("Amendment note", "Validation outcome", "Current reading"), and the status line says only what the vocabulary in `docs/method/status-and-supersession.md` allows. The statuses below are also generated into `docs/product/backlog/STATUS.md`.

For the order in which the decisions were made and changed, see [the decision timeline](../decision-timeline.md).

## By concern

| Concern | Records | Reading order |
|---|---|---|
| Order lifecycle and fulfillment | 0001, 0017 | 0001 (the seam), then 0017 (stock ownership, which refines 0009) |
| Entry path and API gateway | 0008, 0013 | 0008 (the gateway), then 0013 (the BFF becomes the browser's entry; amends 0008) |
| Frontend | 0011, 0012 | 0012; 0011 is superseded and kept as the record |
| Caching | 0002, 0014 | 0002 (the server cache), then 0014 (three layers) |
| Events | 0003 | |
| Data | 0004, 0017 | 0004, then 0017 (the stock counter and reservation records) |
| Identity and authorization | 0006, 0018 | 0006 (users; read "Entra External ID" for "Azure AD B2C"), then 0018 (service callers, proposed) |
| Secrets, CI and delivery | 0007, 0015 | 0007, then 0015 (Azure Pipelines amends the CI secret storage) |
| Observability | 0016 | |
| Payments | 0005 | |
| Service shape and language | 0009, 0010 | 0009 (13 contexts onto 4 services), 0010 (C# on .NET 10) |

## All records

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-fulfillment-strategy-extensibility.md) | Pickup v1; delivery deferred behind an Anticorruption Layer (events only) | Accepted, amended 2026-10-30 |
| [0002](0002-cache-strategy.md) | Environment-conditional managed Redis with a local fallback | Accepted, amended 2026-09-11 to 2026-10-30 |
| [0003](0003-event-driven-backbone.md) | Event Grid (cloud) and Redis Streams (local); at-least-once delivery; per-aggregate sequencing | Accepted, amended 2026-10-30 |
| [0004](0004-data-store-choice.md) | Cosmos DB, one container per bounded context | Accepted, amended 2026-10-30 |
| [0005](0005-payments-buy-vs-build.md) | Stripe Connect (Express accounts) | Accepted |
| [0006](0006-auth-authz-model.md) | JWT validation by every service; role plus resource-ownership authorization; identity provider is Microsoft Entra External ID (the text says Azure AD B2C) | Accepted, amended 2026-09-11 to 2026-10-30 |
| [0007](0007-secrets-management.md) | Key Vault with managed identity; eliminate the secret where possible | Accepted, amended 2026-10-26 and 2026-10-28 |
| [0008](0008-api-gateway.md) | Azure API Management (Consumption) with zero-trust dual validation | Accepted, amended 2026-10-26 |
| [0009](0009-bounded-context-service-mapping.md) | 13 bounded contexts onto 4 services, modular-monolith rule | Accepted |
| [0010](0010-service-language-framework.md) | C# and ASP.NET Core Web API; .NET 10 since 2026-10-28 | Accepted, amended 2026-10-28 and 2026-10-30 |
| [0011](0011-frontend-framework.md) | React (Vite) single-page app | Superseded by ADR-0012 |
| [0012](0012-frontend-nextjs-ssr.md) | Next.js Pages Router; server rendering for public listing pages | Accepted (2026-10-26) |
| [0013](0013-graphql-bff-relay.md) | Node/TypeScript GraphQL BFF with a Relay client as the browser's entry; C# services stay the domain authority | Accepted (2026-10-26) |
| [0014](0014-cache-layers.md) | Three owned cache layers: server (0002), Relay store, HTTP/CDN | Accepted (2026-10-26) |
| [0015](0015-azure-pipelines-ci-cd.md) | Azure Pipelines is the pipeline; GitHub stays source control | Accepted (2026-10-26) |
| [0016](0016-opentelemetry-tracing.md) | OpenTelemetry with W3C `traceparent` as the only propagated correlation mechanism | Accepted (2026-10-26) |
| [0017](0017-stock-and-availability-ownership.md) | The catalog owns the stock counter; reserve at place, release on cancel | Accepted (2026-10-28) |
| [0018](0018-service-to-service-authentication.md) | OAuth2 client credentials for service callers; DEV credential type pending | Proposed (2026-10-28) |

## What has been built, against these decisions

Notes at the bottom of each record say what was built, what was not, and where the code differs from the text. In short (verified 2026-10-30): the cache library, Redis Streams transport with an outbox in ordering, Cosmos repositories on the vNext emulator, JWT middleware and a mock issuer, the BFF, the Next.js app, tracing, and stock reservation exist and run locally. Not built: the Event Grid transport, the chaos event transport, API Management, Entra, Stripe, the catalog cache-aside, Key Vault wiring, anything deployed.

Merging related records into concern chapters (for example 0002 with 0014) was considered and not done: the numbers are cited in specs, evidence and code comments, and the appended notes are part of the record. The by-concern table and the timeline do that job.

See `template.md` for the format.
