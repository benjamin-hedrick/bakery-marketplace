# Portfolio implementation brief

> **Status:** Adopted plan · status checked 2026-10-30. The first slice it describes is built and runs locally; Phase 4 of the evidence goals is not done.

**Where the evidence goals stand (2026-10-30)**

| Goal | State |
|---|---|
| Layered tests; Playwright; deterministic fixtures; CI gates | Built: unit, contract, mock-backed browser, real-stack journeys, and a soft-gate pipeline (`docs/process/quality-gates.md`) |
| Flake and execution-time measurement | Measured once by hand on 2026-10-30 (570 executions, 0 failures; `62-evidence-baseline`); no repeating job, no trend, no gate |
| Bounded AI-assisted testing experiment | **Not done** (Phase 4). A sample of 10 mutation checks was run (9 killed, 1 survived), which is related but not the experiment |
| Maestro as a future path | Not documented; verification of its current web support is open |
| SSR, GraphQL, Relay, REST; normalized client state; BFF without domain | Built (`apps/web-customer`, `services/graphql-bff`) |
| Reusable data-fetching guide; explicit per-cache freshness | Layer documentation exists (ADR-0014); the guide and the per-cache contract (`WI-PORT-004`) are not written |
| ADRs, stable contracts | ADRs 0001 to 0018; no OpenAPI for the services (the BFF has a schema file) |
| IaC; CI/CD | A Key Vault module only; Azure Pipelines build and test with no deployment stage |
| Traceable AI work | Commit messages, the register and `docs/evidence/`; the AI-collaboration record is planned for `docs/method/` |

The first vertical slice (browse, options, pickup window, test checkout, order status) is done: `docs/architecture/first-slice-contract.md`, `docs/evidence/slice-1/findings.md`.

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Mission

Build a compact, production-shaped marketplace slice that demonstrates
senior engineering judgment across web data architecture, test
automation, operations, and disciplined AI-assisted engineering.
Evidence quality matters more than feature count.

## Evidence goals

**Test automation:** layered tests; Playwright/TypeScript; deterministic
fixtures; CI gates; flake and execution-time measurement; actionable
diagnostics; a bounded AI-assisted testing experiment with human review
and honest measurements. Document Maestro as a future path only.

**Web data architecture:** React/TypeScript, SSR, GraphQL, Relay, REST integration;
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
