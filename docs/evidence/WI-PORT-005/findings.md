# WI-PORT-005 Findings: trace propagation (phase 1, local Aspire dashboard)

**Date:** 2026-10-28 · **Branch:** `feature/WI-PORT-005-trace-propagation` · **Status:** partial; see "Not done"

## What was run

Aspire dashboard 13.6.2 (`docker compose --profile tracing up -d aspire-dashboard`), `catalog-service` (in-memory backend) and the BFF, all with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`. One request to the BFF with `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01` (a stand-in for the Next.js server) and a hostile `X-Correlation-Id`. Then the dashboard's telemetry API (`/api/telemetry/traces?traceId=...`).

| Service | Span | Span id | Parent |
|---|---|---|---|
| (inbound caller, not exported) | | `00f067aa0ba902b7` | |
| graphql-bff | `POST /graphql` | `68ebca3c6af139a4` | `00f067aa0ba902b7` |
| catalog-service | `GET /catalog/listings/` | `1d9a53f58a72e4d0` | `68ebca3c6af139a4` |

One trace id on all hops; the BFF response carried `x-correlation-id: 4bf92f3577b34da6a3ce929d0e0e4736` and the same `traceparent` the catalog received.

## Checks

- **Inbound `X-Correlation-Id` is not adopted:** catalog-service answered `X-Correlation-Id: d33c32da583e56f12bb2a42930434596` (its own trace id) to `X-Correlation-Id: attacker`.
- **Exported attributes** (what actually reached the dashboard). BFF: `http.request.method`, `url.path`, `http.response.status_code`. Catalog: `http.request.method`, `server.address`, `server.port`, `user_agent.original`, `url.scheme`, `url.path`, `url.query`, `network.protocol.version`, `http.route`, `http.response.status_code`. No headers, tokens, bodies, query text or variables. The BFF drops operation names that are not short identifiers.
- Neither process log contained `authorization`, `bearer` or `password` for this run (a single unauthenticated request; this is not a proof for authenticated flows, which do not exist yet).
- **Risk to revisit:** the catalog span records `url.query` (here `limit=...`). Fine for pagination; before search or preference endpoints exist, decide whether to drop it (ADR-0016 item 6).

## Automated tests (all run locally)

Logging 3/3; Eventing 16/16 (Redis really reached); BFF 20/20 (new: span export, parenting, no query text, hostile operation names, dead collector); all tools suites, catalog 32/32; `dotnet format` clean; BFF typecheck, lint and Prettier clean.

## Not done

- Next.js server span (so the chain begins at the BFF), real browser-driven trace.
- Log correlation check from the logs themselves (the BFF logs `traceId`; the C# services' console logs were not checked for `TraceId` in scope).
- Consumer spans from the event backbone have no listener in a service yet, so none were seen in the dashboard.
- Jaeger (UAT/Prod) and DEV backend: later phases. Nothing runs on Azure.
- The skeleton smoke was not re-run with tracing on.
