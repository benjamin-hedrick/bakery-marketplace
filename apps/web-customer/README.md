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

## Login (`S1-02`, `WI-AUTH-007`)

Since 2026-11-02 the login is a **server-side session behind an HttpOnly cookie** (ADR-0019), written once in `packages/web-session` and shared with `web-queue-display`. Authorization Code with PKCE for a public client, done by this app's server:

- **Flow.** The header's Log in button goes to `/api/auth/login?returnTo=<this page>`. The server keeps the PKCE verifier and state in a ten-minute pending record (the browser carries only its random id, in a short-lived cookie), and sends the browser to the issuer. The issuer sends it back to `/api/auth/callback`, where the **server** checks the state, exchanges the code (no client secret), stores the tokens encrypted in Redis, and sets the session cookie. A failed login lands on `/auth/error?code=...`, which shows a fixed sentence for the code.
- **What the browser holds.** Only `bakery-session-web-customer` (`__Host-bakery-session-web-customer` over HTTPS): an opaque random id, `HttpOnly`, `SameSite=Lax`, `Path=/`. No token is in the page, its storage, or its HTML, and the Relay environment sends no `Authorization` header. A reload keeps the login.
- **Calls to the BFF.** The browser posts to `/api/graphql` with its cookie; the server renews the access token if it is within 60 seconds of expiring, and attaches `Authorization: Bearer ...` to the call to the BFF. Any `Authorization` header the browser sends is dropped. A public page's anonymous call carries no header.
- **Who is logged in.** `GET /api/auth/me` returns the name and roles for display (never a token). If the server ends the session (the issuer refused the renewal) it sets `x-session-ended` on the answer and the page shows the login again.
- **CSRF.** Every non-`GET` request to `/api/graphql` and `/api/auth/logout` must carry an `Origin` equal to this app's origin and `Content-Type: application/json`; anything else is a 403.
- **Gating a page.** Wrap a client-rendered page in `RequireLogin`. It only decides what to show: the services decide what a login may do.
- **Logging out** (`POST /api/auth/logout`) ends the session on the server and reloads the home page, so nothing fetched while logged in survives in the page.
- **Configuration (read at run time, one image for every environment).** `AUTH_ISSUER` (the issuer as the browser reaches it), `AUTH_ISSUER_INTERNAL` (as this server reaches it, if different), `AUTH_CLIENT_ID`, `APP_ORIGIN` (e.g. `http://localhost:3000`; plain HTTP only on a loopback address), `SESSION_REDIS_URL` (the cache Redis, `redis://127.0.0.1:6380` locally with `docker compose --profile with-redis up -d`), `SESSION_ENCRYPTION_KEY` (generated into `.env` by `node scripts/dev/init-env.mjs`). A missing or bad setting makes the login routes answer 503 and logs the **name** of the setting. Details: `packages/web-session/README.md`.
- **Tests.** `npm run test:e2e` runs the login for real against a fake issuer (`npm run mock-issuer`, port 5101) with sessions in the app's memory (`SESSION_REDIS_URL=memory` needs `SESSION_ALLOW_MEMORY_STORE=1`, tests and demos only): cookie attributes, PKCE with no secret, a reload keeps the login, logout ends it on the server, renewal and a refused renewal, failed logins, forged cross-origin posts, a browser `Authorization` header dropped. `tests/skeleton/login.spec.ts` does it against the real mock issuer.

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
