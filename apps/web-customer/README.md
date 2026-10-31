# web-customer

Customer-facing browse/search/order UI.

**Status (2026-10-30): implements slice 1, run locally only.** Login (authorization code with PKCE; the access token is held in memory, so a reload logs out), browse with stock states, options and quantity, a browser cart, checkout with a visibly stubbed payment, and an order status page. Public listing pages are server-rendered; the authenticated pages are client-rendered. It talks only to the GraphQL BFF (`services/graphql-bff`), through the same-origin `/api/graphql` rewrite. Two kinds of browser test exist: a suite against a mock BFF (`npm run test:e2e`) and journeys against the real stack (`npm run test:skeleton`). Not built: a cookie session, an order history list, preferences, search. Evidence: `docs/evidence/slice-1/findings.md` and `docs/evidence/baseline-2026-10-30.md`; the request path is `docs/architecture/request-path.md`. Decisions: ADR-0012, ADR-0013, ADR-0014.

The look is one plain stylesheet, `src/styles/globals.css` (light and dark by system setting; no framework). Pages and components keep their semantic markup, and the tests select by role, label and `data-testid`, so styling changes do not touch them.

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

**Two build directories.** `node scripts/ci/skeleton-smoke.mjs` builds into `.next-skeleton` (`NEXT_DIST_DIR`) and never touches `.next`, the build the mock-backed `npm run test:e2e` uses. Before 2026-10-28 they shared `.next`, and the mock e2e failed after a smoke run until you rebuilt (the build then contained the BFF address; since 2026-10-31 it does not, and `GRAPHQL_URL` is read at run time by the `/api/graphql` route, so one build serves any back end).

`ENABLE_TEST_HOOKS=1` lets a request pick fixture data via `x-fixture` and add latency via `x-delay-ms`. It is off by default and must never be set outside tests.

## Login (`S1-02`)

Authorization Code with PKCE for a public client (ADR-0006), done entirely in the browser (`src/lib/auth/`):

- **Flow.** The header's Log in button sends the browser to the issuer with an S256 challenge and a state; the issuer sends it back to `/auth/callback`, where the page checks the state, exchanges the code (with the verifier) at the issuer's token endpoint, and goes to the page the user started from. The Next.js server never sees a token (ADR-0012, open item 26): the callback is a client-rendered page and the exchange is a browser request to the issuer, which is why the local mock issuer allows the web app's origin (`MockOidc__AllowedOrigins`, default `http://localhost:3000`).
- **Where things live.** The access token is in memory only (`session.ts`): not in `localStorage`, `sessionStorage` or a cookie, so a reload logs the user out (open item 24, accepted; the planned fix is the cookie-session of `N-01`). Only the pending login (state, verifier, destination) is in `sessionStorage`, for the length of the redirect, and it is spent on first use. A timer ends the session at expiry.
- **Sending it.** The browser Relay environment adds `Authorization: Bearer ...` to calls to our own origin (the `/api/graphql` route to the BFF) and nowhere else; server-side rendering never has one. If the BFF answers `UNAUTHENTICATED`, the session is ended and `UnauthenticatedError` is thrown.
- **Gating a page.** Wrap a client-rendered page in `RequireLogin`. It only decides what to show: the services decide what a token may do.
- **Claims.** `parseClaims` reads the token without verifying it, for display and expiry only.
- **Configuration.** `AUTH_ISSUER` and `AUTH_CLIENT_ID` are read by the server at run time and served to the browser by `GET /api/config` (they are public values, and not in the build, so one image serves every environment). In production both are required: without them `/api/config` answers 503 and the login says it is not configured. Outside production (`next dev`) they default to the local mock issuer, `http://localhost:5100` and `web-customer`.
- **Tests.** `npm run test:unit` (Node's test runner: PKCE against the RFC 7636 vector, session, callback checks); `tests/e2e/login.spec.ts` (issuer stubbed in the browser); `tests/skeleton/login.spec.ts` (the real mock issuer).

## Ordering (`S1-03`, `S1-04`, `S1-05`)

- **The order being built** is a cart in `sessionStorage` (`src/lib/cart/`): ids, options, quantities and what was shown, nothing sensitive. It survives a reload and the login redirect (a full page navigation). Limits and totals in it are hints; ordering-service prices the order and decides.
- **Listing page:** stock status in words (in stock, low, sold out), option checkboxes, a quantity up to the per-order limit, **Add to order**. An item from another bakery needs an explicit "start a new order".
- **`/checkout`** (client-rendered, behind `RequireLogin`): review the order, pick a pickup time (optional, always fetched fresh, shown in the browser's time zone), **Place test order**. The idempotency key is reused for the same order content and replaced when anything changes; the button is disabled in flight. Typed rejections (`PlaceOrderRejected`) and unexpected failures each have a message; the order is kept on any failure.
- **`/orders/{id}`** (client-rendered, behind the login): the status in words, what was ordered, the server's total and the pickup time; read from the network every time; **Refresh status**. An order that is missing or not the customer's reads as not found.
- **Logging out reloads the home page** so Relay's in-memory store cannot show the next person anything the previous customer fetched.
- **Tests.** `npm run test:unit` (cart, auth); `npm run test:e2e` runs 62 browser tests against the mock BFF (57 journeys and states, 5 accessibility scans with axe-core), which now also serves `pickupWindows`, `placeOrder` and `order`. Header `x-place-order: rejected:<CODE> | shortfall | internal | unauthenticated | slow` scripts `placeOrder` there (see `mock-bff/server.mjs`).

## How the Relay/SSR pattern works

- `getServerSideProps` creates a **new** Relay environment per request, fetches the page query, and returns the store's records as page props. Next escapes them into `__NEXT_DATA__`.
- Server rendering uses a separate network-less environment built from those records, so a render can never fetch.
- In the browser, one environment per session merges the server records in (`src/lib/relay/useHydratedEnvironment.ts`), so first paint needs no GraphQL request and client navigation reuses the same store.
- Generated Relay artifacts (`src/__generated__/`) are gitignored and rebuilt by `npm run relay`.
