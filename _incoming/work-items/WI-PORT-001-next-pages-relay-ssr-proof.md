# WI-PORT-001 --- Prove Next.js Pages Router + Relay SSR

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

Use an isolated branch. Do not silently switch to App Router, Apollo, or
a global unisolated Relay environment. Report proceed/reconfigure/stop.
