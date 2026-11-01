# web-queue-display

The vendor's live order queue: a screen for the counter or the kitchen that shows the orders still in progress and changes nothing.

**Status (2026-11-02): built (`WI-QUE-002`) and tested against a mock BFF; not run against the real stack.** Next.js Pages Router, client-rendered (there is nothing public to render on a server, and a vendor's orders must never be), with a Relay environment in the browser only. It talks to the GraphQL BFF (`services/graphql-bff`) through its own origin, `/api/graphql`. Decisions: ADR-0012, ADR-0013; the data is the vendor order read model (`WI-QUE-001`, register items 76 and 113).

## What it shows

Three columns, **New** (placed, waiting for the vendor), **Preparing** (confirmed or in preparation) and **Ready**, each with the oldest order first. An order is its short **reference** (the last six characters of its id, to read out across the counter), what was ordered (quantity, listing name, option names; the id where a name is not known), the requested pickup window and any instructions. Completed and cancelled orders are not shown.

- **Polling.** Every 7 seconds (`POLL_MS`) it asks the BFF's `vendorOrders(status: ACTIVE)` with the vendor's token. Real-time push is a v2 candidate, not built.
- **New orders.** What is on the screen when it opens is not new. An order that appears in a later answer is marked **New** for a minute and announced to screen readers.
- **When a poll fails** the last good queue stays on the screen with "Cannot refresh. Showing the queue as of ...", and it recovers by itself. A login the service no longer accepts ends the queue and offers the login again; a login that is not a vendor's says so.
- **Display only.** The only button is Log out. Acting on an order is the vendor app's job, not this screen's.

## Run it (from `apps/web-queue-display`)

```
npm ci
npm run typecheck          # runs relay-compiler, then tsc
npm run test:unit          # login library and queue logic, Node test runner (51 tests)
npm run mock               # mock GraphQL on :4101 (answers vendorOrders from a list the tests set)
npm run build && npm start # production build on :3100 (GRAPHQL_URL is read at run time)
npm run test:e2e           # Playwright (starts the mock and the app itself if they are not running); 11 tests
```

On first use run `npx playwright install chromium`. The browser tests stub the issuer inside the browser (`page.route`) and use Playwright's clock, so a poll is a step, not a wait.

## Against the real stack

Start the stack as in `docs/operations/local-dev.md`, then `GRAPHQL_URL=http://localhost:4100/graphql npx next start -p 3100`. The mock issuer must allow this app: set `MockOidc__RedirectUris__1=http://localhost:3100/auth/callback` and `MockOidc__AllowedOrigins__1=http://localhost:3100` on the `mock-oidc` service (its defaults allow only port 3000; register item 116). Log in as the vendor `vendor-shop-001`.

## Login

The same as `web-customer` (authorization code with PKCE in the browser, the token in memory only, so a reload logs the screen out); see that app's README. `AUTH_ISSUER` and `AUTH_CLIENT_ID` are read by the server at run time and served at `/api/config`; outside production they default to the local mock issuer and `web-queue-display`. **The login code is a copy** of `web-customer`'s (register item 115): a change under `src/lib/auth/` here must also be made there. An unattended wall screen cannot log itself in again (register item 116).

## Not built

Acting on an order from this screen, real-time push, a per-vendor choice of columns or sound, a Dockerfile and a Compose service, a run on Azure.
