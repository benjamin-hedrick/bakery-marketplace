# ADR: Frontend framework and SSR

-   **Status:** Proposed for adoption
-   **Decision:** React + TypeScript + Next.js Pages Router; SSR for
    customer-facing listing/detail routes and client interaction for
    customization/checkout.

## Context and alternatives

The existing ADR reportedly selects React/Vite SPA and Azure Static Web
Apps; supersede explicitly after review. Vite SPA is simpler but does
not demonstrate SSR. App Router is capable but Relay SSR/data handoff
adds integration uncertainty for this project. React Router framework
mode is viable but offers no clear advantage for target evidence.

## Consequences

Use Node-capable hosting when deployment is introduced. Isolate
request-specific state; define route cache behavior; verify
hydration/Relay handoff. Authenticated/personalized responses default to
private/no-store.

## Validation

Run WI-PORT-001. Prove SSR, Relay data handoff, client refetch/navigation,
and concurrent-request isolation. If it fails, stop and propose an
explicit alternative; do not silently switch frameworks.
