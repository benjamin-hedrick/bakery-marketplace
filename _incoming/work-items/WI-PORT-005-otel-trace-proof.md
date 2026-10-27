# WI-PORT-005 --- Verify trace propagation and safe logs

**Prerequisite:** a request crosses Next.js, BFF, and C# API. One owner.

Instrument available HTTP boundaries, propagate W3C Trace Context, add
structured safe logs, capture success and controlled failure, and
document local trace viewing and gaps.

Acceptance: trace shows available hops/durations; logs correlate by
trace ID; sensitive fields/tokens are absent; client error is safe;
exact commands and evidence location are recorded.
