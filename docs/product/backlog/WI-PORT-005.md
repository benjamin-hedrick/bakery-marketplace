# WI-PORT-005 --- Verify trace propagation and safe logs

```
WI ID:               PORT-005
Title:                Verify trace propagation and safe logs
Type:                 Integration
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-OBSERVABILITY, EPIC-SHARED-TOOLING, EPIC-EVENTING
Hat/Owner:            Platform Engineering (observability integrator)
Status:               Blocked (by WI-PORT-002)
Size:                 TBD
```

**Decisions**: ADR-0016.

**Prerequisite:** a request crosses Next.js, BFF, and C# API. One owner.

Instrument available HTTP boundaries, propagate W3C Trace Context, add
structured safe logs, capture success and controlled failure, and
document local trace viewing and gaps.

Also in scope, per ADR-0016:

-   Change `CorrelationIdMiddleware` (`WI-TOOL-002`, Done) so its value
    is `Activity.Current.TraceId`; stop adopting an inbound
    `X-Correlation-Id`; keep emitting it on responses; keep the
    `CorrelationId` log-scope key as a transition alias. Update its
    tests.
-   Add `traceparent` to `DomainEventEnvelope`; publishers set it,
    consumers start a span linked (not parented) to it.
-   Next.js server starts a new trace per incoming request (no adoption
    of browser-supplied `traceparent` in v1).
-   Choose the local trace viewer (Jaeger or .NET Aspire dashboard) and
    document it.

Supersedes `OBS-002` (correlation-ID propagation using `TOOL-002`).

Acceptance: trace shows available hops/durations; logs correlate by
trace ID; sensitive fields/tokens are absent; client error is safe;
exact commands and evidence location are recorded.
