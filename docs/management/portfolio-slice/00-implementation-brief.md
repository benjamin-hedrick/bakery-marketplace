# Portfolio implementation brief

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Mission

Build a compact, production-shaped marketplace slice that demonstrates
staff/principal engineering judgment across web data architecture, test
automation, operations, and disciplined AI-assisted engineering.
Evidence quality matters more than feature count.

## Target-role evidence

**ServiceTitan:** layered tests; Playwright/TypeScript; deterministic
fixtures; CI gates; flake and execution-time measurement; actionable
diagnostics; a bounded AI-assisted testing experiment with human review
and honest measurements. Document Maestro as a future path only.

**Pinterest:** React/TypeScript, SSR, GraphQL, Relay, REST integration;
reusable data-fetching patterns; normalized client state/refetching;
explicit freshness; latency/reliability/accessibility; Node/TypeScript
BFF composition without domain ownership.

**Cross-cutting:** ADRs with alternatives and consequences; stable
contracts; security/resilience; IaC and CI/CD; bounded AI tasks, human
review, traceable evidence.

## First vertical slice

Seeded listing browse/detail → supported options/customization → pickup
window → test-mode checkout → persisted order confirmation/status. First
prove one listing read path, SSR/hydration, a browser smoke test, CI,
and a trace.

## Ownership and safety

-   C# services own business rules, persistence, pricing, availability,
    order transitions, and authoritative validation.
-   GraphQL BFF owns the client-facing schema, orchestration, downstream
    clients, and safe error mapping---not domain rules or persistence.
-   Browser validation is for UX only. Revalidate critical values
    server-side at checkout.
-   Use a test payment adapter only; define idempotency for safe
    retries.
-   Never log secrets, tokens, payment payloads, or unnecessary
    customer/profile data.

## Non-goals initially

Real payments, native mobile, production customer data, complete
marketplace scope, rich recommendations, production notifications,
speculative distributed caching, and production deployment unless needed
for the evidence goal.

## Success

Reproducible setup/tests; SSR + Relay handoff; no cross-request data
leakage; explicit cache behavior; trace across available hops; useful CI
diagnostics; evidence linked to real commits, test output, traces, and
measurements.
