# ADR-0012: Frontend Framework — Next.js (Pages Router) with SSR

**Status:** Accepted (2026-10-26) — supersedes ADR-0011. Integration validation pending `WI-PORT-001`.

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
