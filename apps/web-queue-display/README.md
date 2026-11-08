# web-queue-display

The vendor's live order queue: a screen for the counter or the kitchen that shows the orders still in progress, live by push with polling as the fallback, and lets the vendor accept, decline, start, mark ready and hand over an order from its buttons.

**Status (2026-11-08): built and run locally only (`WI-QUE-002`, `WI-QUE-003`, `WI-QUE-004`, `WI-QUE-005`).** Its browser suite passes against a mock BFF and a stubbed issuer; the journeys against the real services and the mock issuer (a vendor works an order from the buttons, the wrong caller is refused) ran in `node scripts/ci/skeleton-smoke.mjs` (`docs/evidence/WI-QUE-004/`) and in the demo film; no real identity provider and no deployed system. Next.js Pages Router, client-rendered (there is nothing public to render on a server, and a vendor's orders must never be), with a Relay environment in the browser only. It talks to the GraphQL BFF (`services/graphql-bff`) through its own origin, `/api/graphql`. Decisions: ADR-0012, ADR-0013; the data is the vendor order read model (`WI-QUE-001`, register items 76 and 113).

## What it shows

Three columns, **New** (placed, waiting for the vendor), **Preparing** (confirmed or in preparation) and **Ready**, each with the oldest order first. An order is its short **reference** (the last six characters of its id, to read out across the counter), what was ordered (quantity, listing name, option names; the id where a name is not known), the requested pickup window, any instructions and the customer's allergens (`WI-QUE-005`; the customer is not named). Completed and cancelled orders are not shown.

- **Live, with polling as the fallback** (`WI-QUE-003`, ADR-0021). The screen opens a `vendorOrderChanged` subscription (Server-Sent Events through this app's own `/api/graphql-stream`, which attaches the session's token on the server) and says **Live** while it is up; changed orders are applied on top of the list only if their sequence number is higher. Polling stays the baseline: while the stream is up the list is asked for as a check every 60 seconds, and when it is not the screen says **Polling**, asks every 7 seconds (`POLL_MS`) and retries the stream after 1, 2, 4 ... up to 30 seconds. A stream with no byte for 45 seconds is dead; one the server ends after a healthy life (the token expired) is opened again at once. The rules are in `src/lib/live-feed.ts` (no React, unit tested with a fake clock) and the browser end in `src/lib/live-stream.ts`. Add `?delay=1` to the address to see how long the last pushed change took to arrive.
- **New orders.** What is on the screen when it opens is not new. An order that appears in a later answer is marked **New** for a minute and announced to screen readers.
- **When a poll fails** the last good queue stays on the screen with "Cannot refresh. Showing the queue as of ...", and it recovers by itself. A login the service no longer accepts ends the queue and offers the login again; a login that is not a vendor's says so.
- **Actions** (`WI-QUE-004`). Each order card offers the buttons that fit its status: **Accept** or **Decline** (asks first) for a new order, **Start preparing**, **Mark ready** and **Handed over**, and cancel where the lifecycle allows it. A click sends a mutation through the BFF; the card changes only when the stream (or the next poll) delivers the new status, so there is one source of truth, and if the status does not change the buttons come back. A refused action (the order moved on, or is not this vendor's) says so and refreshes the list. The services decide who may do what; the buttons are a convenience.

## Run it (from `apps/web-queue-display`)

```
npm ci
npm run typecheck          # runs relay-compiler, then tsc
npm run test:unit          # the queue, live-feed, action and allergen logic, Node test runner (the login code lives in packages/web-session)
npm run mock               # mock GraphQL on :4101 (answers vendorOrders from a list the tests set)
npm run mock-issuer        # a fake OpenID issuer on :5101 for the login (packages/web-session/test-support)
npm run build && npm start # production build on :3100 (GRAPHQL_URL is read at run time)
npm run test:e2e           # Playwright (starts the mocks and the app itself if they are not running)
```

The counts of tests in each suite come from `node scripts/ci/test-report.mjs`, not from this page.

On first use run `npx playwright install chromium`. The login runs for real against the fake issuer, with sessions kept in the app's memory (tests only), and the tests use Playwright's clock, so a poll is a step, not a wait. The mock BFF serves the subscription when told to (`streamMode: 'ok'`) and refuses it by default, so the tests written before live updates exercise the polling fallback unchanged.

## Against the real stack

Start the stack as in `docs/operations/local-dev.md` (add `--profile with-redis`: sessions live in the sessions Redis, port 6381), then:

```
APP_ORIGIN=http://localhost:3100 AUTH_ISSUER=http://localhost:5100 AUTH_CLIENT_ID=web-queue-display \
SESSION_REDIS_URL=redis://127.0.0.1:6381 SESSION_ENCRYPTION_KEY=<from .env> \
GRAPHQL_URL=http://localhost:4100/graphql npx next start -p 3100
```

The mock issuer registers `http://localhost:3100/api/auth/callback` by default. Log in as the seeded vendor "Corner Bakery (owner)". `node scripts/dev/demo.mjs` starts all of this for you and prints the guide.

## Login

Server-side session behind an HttpOnly cookie (ADR-0019), the same package as `web-customer`: `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/me`, `/api/graphql`. The page holds no token, a reload keeps the login, and the access token is renewed on the server, so an unattended wall screen stays logged in until the session's idle limit (12 hours) or its absolute lifetime (7 days). See `apps/web-customer/README.md` and `packages/web-session/README.md`.

## Not built

A per-vendor choice of columns or sound, the vendor's listing and stock screens (no spec yet), a Dockerfile and a Compose service for this app, a run on Azure or against a real identity provider.
