# ADR-0016: OpenTelemetry Tracing and W3C Trace Context as the Correlation Mechanism

**Status:** Accepted (2026-10-26) — amends `tech-stack.md` (Observability row) and changes the ID source for `WI-TOOL-002`'s correlation ID. Validation pending `WI-PORT-005`.

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
| Local | .NET Aspire dashboard (compose profile `tracing`) | 1: built with `WI-PORT-005` |
| DEV | Undecided: Aspire or Jaeger, to be chosen when DEV exists | 3 |
| UAT, Prod | Jaeger | 2: with the deployment work items; not built, not designed |

**Open, to confirm with the human lead:** this replaces the Azure Monitor exporter / Application Insights named in decision 5 for UAT and Prod. If Application Insights is kept as well, it is a second OTLP/exporter target, not a change to the instrumentation. Self-hosting Jaeger in Azure needs a container host and a storage choice (memory only loses traces on restart; Badger, Elasticsearch or Cassandra persist them), neither of which is in `budget-cost-estimate.md` (~$0-32/month, driven by Redis). Record the cost and storage choice when the UAT/Prod phase is planned. The `tech-stack.md` Observability row still says Application Insights until that is confirmed.

