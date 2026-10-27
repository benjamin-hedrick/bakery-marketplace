# ADR: OpenTelemetry and diagnostics

-   **Status:** Proposed for adoption
-   **Decision:** Instrument the first vertical slice with
    OpenTelemetry-compatible tracing and safe structured correlated
    logs.

Propagate W3C Trace Context across Next.js, GraphQL BFF, C# APIs, and
instrumented dependencies. Use trace/span IDs, service, operation,
duration, status, and safe error category. Provide local trace viewing;
add Azure export when deployment is justified.

Never emit tokens, authorization headers, secrets, full GraphQL
variables, raw sensitive inputs, or unnecessary profile/payment data.
Use low-cardinality metric labels and sanitize user-controlled strings.

Validate with a trace across available hops, controlled failure,
correlated logs, and documented instrumentation gaps.
