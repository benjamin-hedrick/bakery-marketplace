# web-queue-display

The vendor's live order queue: a screen for the counter or the kitchen that shows the orders still in progress and changes nothing.

**Status (2026-11-02): built (`WI-QUE-002`) and tested against a mock BFF; not run against the real stack.** Next.js Pages Router, client-rendered (there is nothing public to render on a server, and a vendor's orders must never be), with a Relay environment in the browser only. It talks to the GraphQL BFF (`services/graphql-bff`) through its own origin, `/api/graphql`. Decisions: ADR-0012, ADR-0013; the data is the vendor order read model (`WI-QUE-001`, register items 76 and 113).

## What it shows

Three columns, **New** (placed, waiting for the vendor), **Preparing** (confirmed or in preparation) and **Ready**, each with the oldest order first. An order is its short **reference** (the last six characters of its id, to read out across the counter), what was ordered (quantity, listing name, option names; the id where a name is not known), the requested pickup window and any instructions. Completed and cancelled orders are not shown.

- **Live, with polling as the fallback** (`WI-QUE-003`, ADR-0021). The screen opens a `vendorOrderChanged` subscription (Server-Sent Events through this app's own `/api/graphql-stream`, which attaches the session's token on the server) and says **Live** while it is up; changed orders are applied on top of the list only if their sequence number is higher. Polling stays the baseline: while the stream is up the list is asked for as a check every 60 seconds, and when it is not the screen says **Polling**, asks every 7 seconds (`POLL_MS`) and retries the stream after 1, 2, 4 ... up to 30 seconds. A stream with no byte for 45 seconds is dead; one the server ends after a healthy life (the token expired) is opened again at once. The rules are in `src/lib/live-feed.ts` (no React, unit tested with a fake clock) and the browser end in `src/lib/live-stream.ts`. Add `?delay=1` to the address to see how long the last pushed change took to arrive.
- **New orders.** What is on the screen when it opens is not new. An order that appears in a later answer is marked **New** for a minute and announced to screen readers.
- **When a poll fails** the last good queue stays on the screen with "Cannot refresh. Showing the queue as of ...", and it recovers by itself. A login the service no longer accepts ends the queue and offers the login again; a login that is not a vendor's says so.
- **Display only.** The only button is Log out. Acting on an order is the vendor app's job, not this screen's.

## Run it (from `apps/web-queue-display`)

```
npm ci
npm run typecheck          # runs relay-compiler, then tsc
npm run test:unit          # the queue logic, Node test runner (8 tests; the login code lives in packages/web-session)
npm run mock               # mock GraphQL on :4101 (answers vendorOrders from a list the tests set)
npm run mock-issuer        # a fake OpenID issuer on :5101 for the login (packages/web-session/test-support)
npm run build && npm start # production build on :3100 (GRAPHQL_URL is read at run time)
npm run test:e2e           # Playwright (starts the mocks and the app itself if they are not running); 19 tests
```

On first use run `npx playwright install chromium`. The login runs for real against the fake issuer, with sessions kept in the app's memory (tests only), and the tests use Playwright's clock, so a poll is a step, not a wait. The mock BFF serves the subscription when told to (`streamMode: 'ok'`) and refuses it by default, so the tests written before live updates exercise the polling fallback unchanged.

## Against the real stack

Start the stack as in `docs/operations/local-dev.md` (add `--profile with-redis`: sessions live in the cache Redis, port 6380), then:

```
APP_ORIGIN=http://localhost:3100 AUTH_ISSUER=http://localhost:5100 AUTH_CLIENT_ID=web-queue-display \
SESSION_REDIS_URL=redis://127.0.0.1:6380 SESSION_ENCRYPTION_KEY=<from .env> \
GRAPHQL_URL=http://localhost:4100/graphql npx next start -p 3100
```

The mock issuer registers `http://localhost:3100/api/auth/callback` by default. Log in as the vendor `vendor-shop-001`. This run has not been done yet (`WI-AUTH-007` phase 4).

## Login

Server-side session behind an HttpOnly cookie (ADR-0019), the same package as `web-customer`: `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/me`, `/api/graphql`. The page holds no token, a reload keeps the login, and the access token is renewed on the server, so an unattended wall screen stays logged in until the session's idle limit (12 hours) or its absolute lifetime (7 days). See `apps/web-customer/README.md` and `packages/web-session/README.md`.

## Not built

Acting on an order from this screen, real-time push, a per-vendor choice of columns or sound, a Dockerfile and a Compose service, a run on Azure.
