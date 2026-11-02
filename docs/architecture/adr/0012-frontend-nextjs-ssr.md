# ADR-0012: Frontend Framework — Next.js (Pages Router) with SSR

**Status:** Accepted (2026-10-26) — supersedes ADR-0011.

## Context

ADR-0011 chose a React SPA built with Vite, hosted on Azure Static Web Apps, calling backend services directly. It explicitly did not consider SSR because no SEO or first-paint requirement existed.

The project's evidence goals have since changed (see `docs/management/portfolio-slice/00-implementation-brief.md`): the slice must demonstrate server-side rendering, GraphQL composition and Relay's normalized client store, alongside the existing C# domain services. A Vite SPA cannot show SSR. Nothing frontend-side has been built yet (`apps/*/src` contain only `.gitkeep`), so switching now costs documentation and backlog rework, not code.

## Decision

**React + TypeScript + Next.js, Pages Router**, for all three browser apps (`web-customer`, `web-queue-display`, and `web-admin` when built), so there is one frontend toolchain.

- **SSR for public customer-facing reads**: listing browse and listing detail. These pages need no user identity.
- **Client rendering for authenticated and interactive flows**: customization, cart/checkout, order status/history, preferences, and the queue display (polling, per `WI-QUE-002`).
- **Data access goes through the GraphQL BFF via Relay** (ADR-0013), both for SSR and in the browser.
- **Auth posture unchanged from ADR-0006/ADR-0011 for v1**: Authorization Code + PKCE against the mock OIDC issuer (`AUTH-005`) locally and Entra External ID in the cloud. The access token is held in browser memory only. Because authenticated pages render client-side, the Next.js server never holds user tokens or sessions in v1. Server-side rendering of authenticated pages would need a server-side session, which would reopen ADR-0006's cookie/CSRF analysis. It is deferred, not decided.
- **Request isolation**: a new Relay environment per SSR request; no module-level mutable request state.
- **HTTP caching per route** follows ADR-0014. Personalized/authenticated responses default to `private, no-store`.
- **Hosting**: needs a Node-capable host (Azure Static Web Apps' static free tier no longer fits). Azure Container Apps, already in the stack, is the default candidate and gets confirmed when deployment is actually introduced (`INFRA-002`).

## Consequences

**Positive**
- Demonstrates SSR, hydration and Relay data handoff — the target evidence.
- One frontend toolchain across all browser apps.
- The existing auth design and mock issuer are reused unchanged.

**Negative / accepted limitations**
- More moving parts than a static SPA: Node runtime in production, hydration correctness, request isolation.
- Loses the Static Web Apps permanent free tier for the frontend. Container Apps' consumption free grant is the expected replacement, so this needs re-checking in `budget-cost-estimate.md` when hosting is decided.
- Relay SSR integration with Pages Router is the main technical risk, which is why `WI-PORT-001` must prove it before broad frontend work.

## Alternatives considered

1. **Keep ADR-0011 (Vite SPA).** Simpler, but cannot demonstrate SSR. Rejected for the revised evidence goals.
2. **Next.js App Router / React Server Components.** Capable, but Relay's SSR/data-handoff story there carries more integration uncertainty. Not chosen; `WI-PORT-001` must not silently switch to it.
3. **React Router framework mode (formerly Remix).** Viable, with no clear advantage for the target evidence.

## Validation

`WI-PORT-001` proves SSR, Relay handoff, hydration, client refetch/navigation and concurrent-request isolation. If it fails, stop and propose an explicit alternative through a new ADR rather than silently switching frameworks.

## Related

- ADR-0011 — superseded by this ADR
- ADR-0013 — GraphQL BFF + Relay (data path)
- ADR-0014 — cache layers (HTTP and Relay layers)
- ADR-0006 — auth model, unchanged
- `open-items-register.md` #24 (no refresh token) — still applies unchanged

## Validation outcome (WI-PORT-001, 2026-10-26)

The proof **passed**: SSR content before hydration, no hydration warnings, client navigation and refetch, and no cross-request leakage under 200 concurrent requests, on Next.js 16.4.3 (Pages Router), React 19.3.0 and Relay 21.0.1. The decision stands; no framework change was needed. Two details to carry forward:

- **`relay-nextjs` was rejected**, not adopted. It depends on `serialize-javascript@5`, which has high-severity advisories with no fix available, and it has not been published since January 2025. The Relay integration is a small in-repo pattern (`apps/web-customer/src/lib/relay/`): a new Relay environment per `getServerSideProps` call, records returned as ordinary page props, and one environment per browser session.
- **Next.js must be 16.4.3 or later** (16.4.0 has critical advisories).

Not yet verified: a Node LTS runtime, Firefox/WebKit, `next dev` StrictMode behavior, authenticated pages, mutations. Evidence: `docs/evidence/WI-PORT-001/findings.md`.

## Amendment note (2026-10-30: slice 1)

The validation outcome above covered the proof of concept (`WI-PORT-001`). Since then `apps/web-customer` has implemented slice 1 on this stack (login, browse, cart, checkout, order status; `docs/evidence/slice-1/findings.md`). On 2026-10-30 its 53 unit tests passed, 57 mock-backed browser tests passed in each of 10 runs, and 21 real-stack journeys passed in each of 3 runs (`docs/evidence/baseline-2026-10-30.md`). Nothing is deployed.

## Note, 2026-11-02: the queue display

ADR-0021 (Accepted 2026-11-02) amends the queue display's line above: it still polls the BFF (built as `WI-QUE-002`, polling every 7 seconds, client-rendered, no server-side Relay), and it will gain a pushed stream in front of the polling, which stays as the fallback and the resynchronization. ADR-0019 (Proposed) would change where the access token lives for the browser apps (a server-side session, not page memory); the "authenticated pages are client-rendered" rule here is not changed by either.

## Note, 2026-11-02: the Next.js server now holds tokens (ADR-0019)

"The Next.js server never holds user tokens" (register item 26) no longer holds for the browser apps: ADR-0019 (Accepted 2026-11-02) puts the login on the web app's server, which keeps the access and refresh tokens, encrypted, in Redis and attaches the bearer header to the BFF call. Authenticated pages are still client-rendered; what changed is that rendering them on the server is now *possible* (the session is there). Both apps moved on 2026-11-02 (WI-AUTH-007 phase 3). Server-side API routes `/api/auth/*` and `/api/graphql` replace the browser's `/auth/callback` page and its token exchange.

## Note, 2026-11-02: the queue display has its pushed stream

The queue display now has the pushed stream that ADR-0021 added in front of its polling (`WI-QUE-003`): a `vendorOrderChanged` subscription served by the GraphQL BFF over Server-Sent Events (the BFF stays composition and error mapping: ordering-service decides what a vendor sees and validates the token), reached by the browser through the web app's own origin at `/api/graphql-stream`, where the session's token is attached on the server (ADR-0019). Polling is unchanged and remains the baseline and the fallback (7 seconds when the stream is down, a 60-second check while it is up). The rest of this ADR stands: the BFF is still the only API the browser talks to, and the apps are still Next.js Pages Router apps with a Relay client; the subscription is the one place where Relay's network layer is not used for transport (the `graphql-sse` client carries it), because Relay's subscription support needs a transport the application supplies. Evidence: `docs/evidence/WI-QUE-003/`.
