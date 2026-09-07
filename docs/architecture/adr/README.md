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

See `template.md` for the format used above (renamed from `0000-template.md` to avoid being mistaken for a real decision).
