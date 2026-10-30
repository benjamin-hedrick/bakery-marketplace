> **Status:** Done · evidence: `tools/BakeryMarketplace.Logging` and `tools/tests/BakeryMarketplace.Logging.Tests`

```
WI ID:               TOOL-002
Title:                Structured logging + correlation-ID helper (tools/BakeryMarketplace.Logging)
Type:                 Interface/Contract
Epic:                 EPIC-SHARED-TOOLING
Shared with epic(s):  EPIC-OBSERVABILITY (OBS-002 implements against this)
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 S
```

> **As-built record (rewritten 2026-10-30).** This spec was rewritten from its 2026-09 plan to describe what exists. The original text, including its middleware code block that adopted an inbound `X-Correlation-Id`, is in git history (`git log -- docs/product/backlog/WI-TOOL-002.md`). The changes are listed under "Changes from the original plan".

**Context / Why**
Multiple services need consistent structured logging and one identifier that ties a request's log lines to its trace. `tech-stack.md` names Application Insights as the observability tooling; this item is the thin shared convention layer on top of it. It does not depend on the cache, repository, event or auth libraries.

**What exists** (`tools/BakeryMarketplace.Logging`)
- `CorrelationIdMiddleware` (ASP.NET Core): the identifier is the W3C trace ID of the current request (`Activity.Current.TraceId`, ADR-0016). An inbound `X-Correlation-Id` is **never adopted**, because a caller could otherwise choose the identifier that appears in our logs. With no W3C activity (no listener, hierarchical id format) a fresh trace ID is generated. The value is returned on the response as `X-Correlation-Id`, a response-only alias of the trace ID, and is available in `HttpContext.Items`.
- Log scope keys: `TraceId` is the identifier; `CorrelationId` is kept as a transition alias.
- `UseCorrelationId()` registers the middleware.
- `LogStructuredEvent(...)` writes an entry with `ServiceName` and an optional `EventType` as structured properties, not interpolated into the message.
- `AddBakeryTelemetry` wires OpenTelemetry for the services (`WI-PORT-005`).
- Tests (`BakeryMarketplace.Logging.Tests`, 3 passed on 2026-10-30): the middleware uses the current activity's trace ID; it ignores an inbound `X-Correlation-Id`; it generates a trace ID when there is no activity.

**You do not need to know about**
- Any domain logic or other shared library.

**Out of scope**
- Configuring Application Insights itself (an infrastructure item under `EPIC-OBSERVABILITY`).
- Dashboards and alert rules (`OBS-001`, `OBS-003`).

**Acceptance criteria (as met)**
- Every request gets a correlation identifier that equals its trace ID.
- Structured entries carry `ServiceName` and, when applicable, `EventType` as properties.
- Tests prove the identifier source and that a client-supplied value is not trusted.

**Changes from the original plan**
- The original plan propagated an inbound `X-Correlation-Id` and generated a GUID otherwise. ADR-0016 replaced that: the identifier is the trace ID, an inbound header is ignored, and the header is response-only. The unit tests changed with it ("an incoming header is propagated" became "an incoming header is ignored").
- The `CorrelationId` log-scope key is kept as an alias next to `TraceId`.
- The code change was delivered under `WI-PORT-005`, not by reopening this item.
- The folder is `tools/BakeryMarketplace.Logging`, not `/tools/logging-helper`.

**Dependencies**
- Blocks: none directly. Blocked by: none.

**Definition of Done**
See `docs/process/definition-of-done.md`.

**Open Points (working)**
*(none currently)*
