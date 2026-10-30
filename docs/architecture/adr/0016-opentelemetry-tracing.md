# ADR-0016: OpenTelemetry Tracing and W3C Trace Context as the Correlation Mechanism

**Status:** Accepted (2026-10-26) — amends `tech-stack.md` (Observability row) and changes the ID source for `WI-TOOL-002`'s correlation ID.

## Context

`tech-stack.md` names Application Insights + Azure Monitor. `WI-TOOL-002` (Done) built `CorrelationIdMiddleware`, which reads an inbound `X-Correlation-Id` header (any string, unvalidated) or generates a GUID, echoes it on the response, and puts it into the log scope. The request path now crosses Next.js → BFF → C# services, and asynchronous hops run over the event backbone. `DomainEventEnvelope` currently carries no correlation or trace field at all.

Running a custom correlation ID alongside OpenTelemetry trace IDs would create two join keys that can disagree. Application Insights correlates on `operation_Id`, which is the W3C trace ID.

## Decision

**Instrument with OpenTelemetry. Make W3C Trace Context (`traceparent`/`tracestate`) the only propagated correlation mechanism. Keep `X-Correlation-Id` as a response-only alias whose value is the trace ID.**

1. **Propagation**: `traceparent`/`tracestate` across Next.js server → BFF → C# services and instrumented dependencies. On .NET 8, ASP.NET Core and `HttpClient` do this natively once OpenTelemetry is registered; the Node SDK covers Next.js and the BFF. No custom correlation header is forwarded downstream.
2. **`CorrelationIdMiddleware`** (follow-up change to `TOOL-002`'s code):
   - The value becomes `Activity.Current.TraceId`.
   - An inbound `X-Correlation-Id` is no longer trusted or adopted.
   - `X-Correlation-Id` is still emitted on responses, as a client-safe reference ID for error messages.
   - The `CorrelationId` log-scope key is kept as an alias for one transition period, then retired in favour of the `TraceId`/`SpanId` fields OpenTelemetry logging adds.
3. **Browser boundary**: the Next.js server starts a new trace for each incoming page or API request and does not adopt a browser-supplied `traceparent` as its parent in v1. Browser-side real-user monitoring is deferred.
4. **Event backbone**: `DomainEventEnvelope` gains a `traceparent` field, set by the publisher. Consumers start their own span with a **span link** to the publisher's context rather than a parent/child relationship, which suits at-least-once delivery (ADR-0003).
5. **Backends**: a local trace viewer for development (Jaeger or the .NET Aspire dashboard, chosen in `WI-PORT-005`). In the cloud, the Azure Monitor OpenTelemetry exporter sends data to Application Insights, which remains the backend.
6. **Data safety**: never emit tokens, `Authorization` headers, secrets, full GraphQL variables, raw sensitive input, payment payloads, or unnecessary profile or dietary data, which `nfrs.md` treats as quasi-health data. Use low-cardinality metric labels and sanitize user-controlled strings.

## Consequences

**Positive**
- One join key across logs, traces and Application Insights.
- Mostly framework-provided propagation; no hand-rolled header plumbing.
- Removes a log-injection and ID-spoofing vector (an unvalidated client header going into logs).
- Async hops become traceable.

**Negative / accepted limitations**
- A behavior change to a Done item's code (`TOOL-002`), plus an envelope schema change (`EVT-001`'s envelope). Both are tracked under `WI-PORT-005`.
- A client that relied on its own `X-Correlation-Id` being echoed back will now see the server's trace ID instead. No such client exists yet.
- Browser↔server trace joining doesn't happen in v1.

## Alternatives considered

1. **Keep both as independent IDs.** Rejected: two keys that can disagree, and the unvalidated header stays.
2. **Drop `X-Correlation-Id` entirely.** Rejected for now: it breaks `TOOL-002`'s contract and loses a convenient client-facing reference ID.
3. **Accept browser `traceparent` as the parent.** Deferred: it's untrusted input, and there's no browser instrumentation yet.

## Related

- `tech-stack.md` — Observability row
- `WI-TOOL-002`, `OBS-001`, `OBS-002`, `WI-PORT-005`
- ADR-0003 — event envelope and delivery semantics
- ADR-0013 — BFF hop

## Amendment 2026-10-28: trace backends by environment, phased

Decided by the human lead; refines decision 5 (Backends). All services emit **OTLP only** (standard `OTEL_EXPORTER_OTLP_*` settings), so the backend is configuration and no service code depends on a viewer.

| Environment | Backend | Phase |
|---|---|---|
| Local | .NET Aspire dashboard, directly or through the collector (compose profiles `tracing`, `collector`) | 1: built with `WI-PORT-005` |
| DEV | Application Insights, through the collector | 2: not built |
| UAT, Prod | Application Insights through the collector; **Jaeger opt-in** as an additional exporter | 2: not built |

**OpenTelemetry Collector (decided 2026-10-28):** cloud services send OTLP to a collector, and the collector exports to Application Insights (`azuremonitor` exporter) and, where enabled, Jaeger. Reasons: the Application Insights connection string lives in one place (ADR-0007) instead of in every .NET service and the Node BFF; the services stay on the OTLP-only rule; and a central `attributes` processor drops `url.query` and `http.url` before data leaves (ADR-0016 item 6). Config: `infra/otel-collector/` (`local.yaml`, `local-jaeger.yaml`, `cloud.yaml`, all validated with `otelcol-contrib validate`). Locally the collector is optional; direct export to Aspire stays the default and does not apply the safety processor.

This **keeps** Application Insights as the cloud backend named in decision 5 (the earlier "Jaeger replaces it" reading is withdrawn); Jaeger is an opt-in extra for UAT/Prod. Still open: who hosts the collector in Azure (for example a Container Apps container), and its cost (not in `budget-cost-estimate.md`). `cloud.yaml` has not been run against Azure.

## Validation outcome (2026-10-30)

Built and evidenced by `WI-PORT-005` (`docs/evidence/WI-PORT-005/findings.md`): one trace id on every hop of a checkout across the web server, BFF, ordering and catalog. `CorrelationIdMiddleware` never adopts an inbound `X-Correlation-Id`; the header is a response-only alias of the trace id. Follow-ups remain open as register items 36, 37 and 42. Where the text above says .NET 8, the services target .NET 10 (ADR-0010).
