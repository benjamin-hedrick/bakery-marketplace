# WI-PORT-005 Findings: trace propagation (phase 1, local Aspire dashboard)

> **Current result (2026-10-30):** built, and later phases are recorded below (collector configs validated, the Next.js server span, consumer spans for the catalog). The slice-1 capture (`docs/evidence/slice-1/findings.md`) ran the whole smoke with tracing on: one trace across the web server, the BFF, ordering and the catalog, and a scan of exported spans found no token, key or secret. The "partial" status above means the open follow-ups: register items 36, 37, 42 and 82 (hand-rolled exporters, no cloud pipeline, no page-render span, an untraced browser).

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
- **`url.query` (corrected 2026-10-28):** the catalog span records the attribute, but the instrumentation redacts the values (`?limit=Redacted&after=Redacted`), so only parameter names are exported; the first version of this note implied the values were. Guarded by a test; see open item 38.

## Automated tests (all run locally)

Logging 3/3; Eventing 16/16 (Redis really reached); BFF 20/20 (new: span export, parenting, no query text, hostile operation names, dead collector); all tools suites, catalog 32/32; `dotnet format` clean; BFF typecheck, lint and Prettier clean.

## Not done

- Next.js server span (so the chain begins at the BFF), real browser-driven trace.
- Log correlation check from the logs themselves (the BFF logs `traceId`; the C# services' console logs were not checked for `TraceId` in scope).
- Consumer spans from the event backbone have no listener in a service yet, so none were seen in the dashboard.
- Jaeger (UAT/Prod) and DEV backend: later phases. Nothing runs on Azure.
- The skeleton smoke was not re-run with tracing on.

## Collector (added 2026-10-28)

`infra/otel-collector/{local,local-jaeger,cloud}.yaml` pass `otelcol-contrib validate` (0.164.0; `cloud.yaml` with a dummy connection string). Run locally: catalog-service and the BFF exported OTLP/HTTP to the collector (:4328), which delivered the same two-hop trace to both the Aspire dashboard and Jaeger 2.22.0, with `url.query` removed. A first attempt failed: the collector's default gzip made the Aspire OTLP/HTTP endpoint answer 500, fixed with `compression: none`. Not run: the `azuremonitor` exporter against a real Application Insights resource; the collector in Azure.

## Next.js span, log correlation, consumer spans (added 2026-10-28)

- **Three tiers in one trace.** Dashboard, catalog-service, BFF and the Next.js server (`next start`, built with `GRAPHQL_URL` at the BFF) all exporting to Aspire; one `GET /` produced `web-customer POST graphql (BFF)` (no parent, span `9d402bc2ec953adb`) → `graphql-bff POST /graphql` (parent `9d402bc2ec953adb`) → `catalog-service GET /catalog/listings/` (parent `da306da67a59f174`, the BFF span). A browser-supplied `traceparent` is still never adopted.
- **Log correlation (catalog-service).** With `traceparent: 00-7bf92f35...` sent, the console log lines for the request carry `TraceId:7bf92f3577b34da6a3ce929d0e0e4736` and `ParentId:00f067aa0ba902b7` (ASP.NET Core activity scopes, shown because `IncludeScopes` is on in the Development config). A request without `traceparent` gets its own TraceId.
- **Event consumer spans.** `CatalogService.Tests/TracingTests.cs`: the service host subscribes to the `BakeryMarketplace.Eventing` activity source, and a `VendorVerified` handled by the real subscription path produces a `Consumer` activity on a new trace linked to the publisher's trace. The response `X-Correlation-Id` equals the inbound trace id and an inbound `X-Correlation-Id` is ignored. Catalog tests 34/34.
- **Regression check after the web change:** typecheck, lint, Prettier; mock e2e 6/6; SSR isolation 200/200 (after rebuilding `.next` without `GRAPHQL_URL`, open item 43).
- Not done: log export; page-render span; skeleton smoke with tracing; Azure; `cloud.yaml` against Application Insights.
