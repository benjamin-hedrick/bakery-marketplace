# web-customer

Customer-facing browse/search/order UI.

**Status: WI-PORT-001 proof only.** This app currently proves Next.js (Pages Router) + Relay server-side rendering against a **mock** GraphQL server. It has no auth, cart, checkout or real BFF yet. Findings and evidence: `docs/evidence/WI-PORT-001/findings.md`. Decisions: ADR-0012, ADR-0013, ADR-0014.

## Run it (from `apps/web-customer`)

```
npm ci
npm run typecheck          # runs relay-compiler, then tsc
npm run build              # relay-compiler + next build
npm run mock               # terminal 1: mock GraphQL on :4000
ENABLE_TEST_HOOKS=1 npx next start -p 3000    # terminal 2 (production build)
npm run test:isolation     # 200 concurrent SSR requests, two fixtures
npm run test:e2e           # Playwright (starts the servers itself if they are not running)
```

On first use run `npx playwright install chromium`.

**Two builds, two directories.** `GRAPHQL_URL` is baked into the build (the `/api/graphql` rewrite), so `node scripts/ci/skeleton-smoke.mjs` builds into `.next-skeleton` (`NEXT_DIST_DIR`) and never touches `.next`, the build the mock-backed `npm run test:e2e` uses. Before 2026-10-28 they shared `.next`, and the mock e2e failed after a smoke run until you rebuilt.

`ENABLE_TEST_HOOKS=1` lets a request pick fixture data via `x-fixture` and add latency via `x-delay-ms`. It is off by default and must never be set outside tests.

## Login (`S1-02`)

Authorization Code with PKCE for a public client (ADR-0006), done entirely in the browser (`src/lib/auth/`):

- **Flow.** The header's Log in button sends the browser to the issuer with an S256 challenge and a state; the issuer sends it back to `/auth/callback`, where the page checks the state, exchanges the code (with the verifier) at the issuer's token endpoint, and goes to the page the user started from. The Next.js server never sees a token (ADR-0012, open item 26): the callback is a client-rendered page and the exchange is a browser request to the issuer, which is why the local mock issuer allows the web app's origin (`MockOidc__AllowedOrigins`, default `http://localhost:3000`).
- **Where things live.** The access token is in memory only (`session.ts`): not in `localStorage`, `sessionStorage` or a cookie, so a reload logs the user out (open item 24, accepted; the planned fix is the cookie-session of `N-01`). Only the pending login (state, verifier, destination) is in `sessionStorage`, for the length of the redirect, and it is spent on first use. A timer ends the session at expiry.
- **Sending it.** The browser Relay environment adds `Authorization: Bearer ...` to calls to our own origin (the rewrite to the BFF) and nowhere else; server-side rendering never has one. If the BFF answers `UNAUTHENTICATED`, the session is ended and `UnauthenticatedError` is thrown.
- **Gating a page.** Wrap a client-rendered page in `RequireLogin`. It only decides what to show: the services decide what a token may do.
- **Claims.** `parseClaims` reads the token without verifying it, for display and expiry only.
- **Configuration.** `NEXT_PUBLIC_AUTH_ISSUER` (default `http://localhost:5100`) and `NEXT_PUBLIC_AUTH_CLIENT_ID` (default `web-customer`) are read at build time; they are public values.
- **Tests.** `npm run test:unit` (Node's test runner: PKCE against the RFC 7636 vector, session, callback checks); `tests/e2e/login.spec.ts` (issuer stubbed in the browser); `tests/skeleton/login.spec.ts` (the real mock issuer).

## How the Relay/SSR pattern works

- `getServerSideProps` creates a **new** Relay environment per request, fetches the page query, and returns the store's records as page props. Next escapes them into `__NEXT_DATA__`.
- Server rendering uses a separate network-less environment built from those records, so a render can never fetch.
- In the browser, one environment per session merges the server records in (`src/lib/relay/useHydratedEnvironment.ts`), so first paint needs no GraphQL request and client navigation reuses the same store.
- Generated Relay artifacts (`src/__generated__/`) are gitignored and rebuilt by `npm run relay`.
