# WI-PORT-001 --- Prove Next.js Pages Router + Relay SSR

```
WI ID:               PORT-001
Title:                Prove Next.js Pages Router + Relay SSR
Type:                 Test/Mock/Chaos (technical proof)
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-WEB-CUSTOMER
Hat/Owner:            Engineering/Build (one owner)
Status:               Done 2026-10-26 (merged 6175e05) — all acceptance criteria met; evidence in docs/evidence/WI-PORT-001/findings.md
Size:                 TBD
```

**Decisions**: ADR-0012 (Next.js Pages Router + SSR), ADR-0013 (Relay via GraphQL BFF), ADR-0014 (Relay per-request isolation).

**Priority:** Blocking prerequisite for broad frontend implementation.
One owner.

## Goal and scope

Prove the chosen integration before full UI work: minimal Pages Router
route; minimal Relay environment/compiler config; deterministic listing
query (mock-backed if needed); SSR; hydration and client
refetch/navigation; concurrent-request isolation; reproducible commands.

## Exclusions

Full schema, checkout, production deployment, broad design system, App
Router/RSC exploration, unrelated refactoring.

## Acceptance

-   HTML contains listing content before hydration.
-   Relay artifact/type generation and build work from a clean checkout.
-   Hydration has no relevant warnings or duplicate/stale-state defects.
-   Client refetch/navigation updates expected data.
-   Concurrent SSR requests with different fixtures cannot leak data.
-   Record versions/config, test evidence, constraints, and
    recommendation.

## Stop conditions

Use a short-lived branch per `docs/process/branching-strategy.md`; do not touch central docs or shared domain contracts. Do not silently switch to App Router, Apollo, or
a global unisolated Relay environment. Report proceed/reconfigure/stop.
