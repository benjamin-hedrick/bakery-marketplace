```
WI ID:               TOOL-002
Title:                Structured logging + correlation-ID helper (/tools/logging-helper)
Type:                 Interface/Contract
Epic:                 EPIC-SHARED-TOOLING
Shared with epic(s):  EPIC-OBSERVABILITY (OBS-002 implements against this)
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

> **Reconciliation note (2026-10-26) — ADJUSTED (follow-up change).** Delivered and reviewed (Done per `MASTER-BACKLOG-OUTLINE.md`). ADR-0016 changes the correlation ID's **source**: it becomes `Activity.Current.TraceId`; an inbound `X-Correlation-Id` is no longer adopted (currently any client-supplied string is trusted and logged); the header is still emitted on responses; and the `CorrelationId` log-scope key stays as a transition alias. The code change is tracked in `WI-PORT-005`, not by reopening this item. See `worklog/reconciliation/RECONCILIATION-DISPOSITIONS-2026-10-26.md`.


**Context / Why**
Multiple services need consistent structured logging with correlation-ID propagation, but nothing has built the shared piece yet. `tech-stack.md` names Application Insights as the observability tooling; this item is the thin, shared convention layer every service uses on top of it. **Fully independent of batch 1** — no reference to `ICacheProvider`, `IRepository<T>`, `IEventPublisher`, or the auth middleware.

**Inputs / References**
- *Decisions*: `docs/architecture/tech-stack.md` (Application Insights + Azure Monitor already confirmed as the tooling — this item doesn't re-decide that), ADR-0010 (C#/.NET, `Microsoft.Extensions.Logging`)
- *Interfaces*: none consumed
- *Environment/tooling*: not applicable
- *Test/chaos methodology*: not applicable — this is a cross-cutting logging concern, not independently chaos-tested
- *Business context*: `docs/operations/monitoring-alerting.md` (this helper's structured fields should support the thresholds that document defines — e.g., being able to correlate a latency spike back to a specific request)

**You do not need to know about**
- Any domain logic, or any batch-1 interface — this is pure cross-cutting infrastructure

**Out of scope**
- Does not configure Application Insights itself (a separate, not-yet-detailed Infra/Environment item under `EPIC-OBSERVABILITY`)
- Does not build dashboards or alert rules — `OBS-001`/`OBS-003`'s job, not this one

**Requirements / Acceptance Criteria**
- ASP.NET Core middleware that propagates or generates a correlation ID per request:
```csharp
public class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    public CorrelationIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers.TryGetValue("X-Correlation-Id", out var existing)
            ? existing.ToString()
            : Guid.NewGuid().ToString();

        context.Response.Headers["X-Correlation-Id"] = correlationId;
        using (LogContext.PushProperty("CorrelationId", correlationId))
        {
            await _next(context);
        }
    }
}
```
- A structured-logging convention (e.g., a small `ILoggerExtensions` wrapper) so every log entry carries `CorrelationId`, `ServiceName`, and `EventType` (when applicable) as structured fields, not string-interpolated into the message
- Unit tests proving: an incoming `X-Correlation-Id` header is propagated, not replaced; a request with no header gets a newly generated one; the ID appears on every log line emitted during that request's scope

**Dependencies**
- Blocks: none directly, though every service benefits from this existing before their own logging is wired
- Blocked by: none
- Can be worked in parallel with: everything, including all of batch 1

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes. Fully specified, standard ASP.NET Core middleware pattern, no dependency on any unverified interface.

**Open Points (working)**
*(none currently)*
