# Observability and Azure DevOps plan

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Observability

Decision: ADR-0016 (W3C Trace Context is the only propagated correlation mechanism; `X-Correlation-Id` becomes a response alias of the trace ID; event envelopes carry `traceparent`).


Use OpenTelemetry-compatible tracing and structured logs from the first
slice. Propagate W3C Trace Context across Next.js, GraphQL BFF, C# APIs,
and instrumented dependencies. Log trace/span IDs, service, operation,
outcome, duration, and safe error category. Provide a local trace
viewer; add Azure export when cloud deployment is justified.

Distinguish liveness from readiness. Set downstream timeouts; retry only
where semantics and idempotency permit. Never log tokens, authorization
headers, secrets, full GraphQL variables, raw sensitive input, or
payment payloads. Avoid high-cardinality metric labels and sanitize
user-controlled strings.

Evidence: one successful trace, one controlled failure, correlated safe
logs, and documented instrumentation gaps. Verify propagation; do not
assume browser/server trace joining works automatically.

## CI/CD direction

Decision: ADR-0015.


GitHub remains source control; Azure Pipelines is the single
CI/CD system. Begin with validate → fast tests → build/package. Add
integration, Playwright, security scanning, deployment gates, and
post-deploy smoke tests as dependencies become real.

Use least privilege, protected service connections, federated identity
where supported, and separate CI/deploy permissions. Keep secrets out of
YAML; publish useful test artifacts.

Do not remove `.github/workflows/ci.yml` until ADO works, required
checks/branch protection are migrated, and docs identify the
authoritative pipeline. Then remove/replace the placeholder in one
explicit migration.
