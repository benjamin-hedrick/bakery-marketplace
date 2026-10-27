# Architecture Decision Records

One file per decision: `0001-title.md`, `0002-title.md`, etc. Use a standard ADR template (Context, Decision, Status, Consequences).

## Accepted ADRs

1. [0001 — Fulfillment Strategy Extensibility](0001-fulfillment-strategy-extensibility.md) — pickup v1, delivery/dispatch deferred behind an Anticorruption Layer
2. [0002 — Cache Strategy](0002-cache-strategy.md) — environment-conditional managed Redis with local fallback
3. [0003 — Event-Driven Backbone](0003-event-driven-backbone.md) — Azure Event Grid (cloud) / Redis Streams (local), at-least-once delivery, per-aggregate sequencing
4. [0004 — Primary Data Store Choice](0004-data-store-choice.md) — Azure Cosmos DB, container-per-bounded-context
5. [0005 — Payments Buy-vs-Build](0005-payments-buy-vs-build.md) — Stripe Connect (Express accounts)
6. [0006 — Auth/Authz Model](0006-auth-authz-model.md) — Azure AD B2C, role + resource-ownership authorization
7. [0007 — Secrets Management](0007-secrets-management.md) — Azure Key Vault with managed identity, eliminate-the-secret-where-possible
8. [0008 — API Gateway](0008-api-gateway.md) — Azure API Management (Consumption tier), zero-trust dual validation with ADR-0006
9. [0009 — Bounded-Context-to-Service Mapping](0009-bounded-context-service-mapping.md) — 13 contexts onto 4 services, modular monolith rule
10. [0010 — Service Language & Framework](0010-service-language-framework.md) — C# / .NET 8, ASP.NET Core Web API
11. [0012 — Frontend Framework: Next.js Pages Router + SSR](0012-frontend-nextjs-ssr.md) — React/TypeScript/Next.js for all browser apps; SSR for public listing pages; supersedes 0011
12. [0013 — GraphQL BFF + Relay](0013-graphql-bff-relay.md) — Node/TypeScript BFF as the browser's API entry point; C# services stay domain authorities; amends 0008
13. [0014 — Cache Layers](0014-cache-layers.md) — server (ADR-0002, unchanged), Relay store, and HTTP/CDN as three owned layers
14. [0015 — CI/CD: Azure Pipelines](0015-azure-pipelines-ci-cd.md) — GitHub stays source control; Azure Pipelines authoritative; amends 0007
15. [0016 — OpenTelemetry + W3C Trace Context](0016-opentelemetry-tracing.md) — `traceparent` is the only propagated correlation mechanism; `X-Correlation-Id` becomes a response alias of the trace ID

## Superseded ADRs

- [0011 — Frontend Framework: React (Vite) SPA](0011-frontend-framework.md) — superseded by 0012 on 2026-10-26 (kept as the historical record)

## Amended ADRs

Amendments are recorded as dated notes at the bottom of the amended ADR, never by rewriting the original decision text: 0002 (by 0014), 0006 (by 0008, Entra swap, 0011), 0007 (by 0015), 0008 (by 0013).

See `template.md` for the format used above (renamed from `0000-template.md` to avoid being mistaken for a real decision).
