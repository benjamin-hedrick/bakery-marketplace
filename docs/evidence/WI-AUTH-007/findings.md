# WI-AUTH-007 Findings: browser sessions on the web apps' servers

> **Current result (2026-11-02):** both web apps log in through the server-side session and the real-stack journeys passed (23 on the host stack). The security review the definition of done requires, the first Azure run of the `session` job and the applied dev environment are not done (`docs/product/backlog/STATUS.md`).

**Date:** 2026-11-02 · **Branch:** `feature/vendor-order-detail` · **Code:** `packages/web-session/`, `apps/web-customer/`, `apps/web-queue-display/`, `tools/BakeryMarketplace.Auth/` · **Decision:** ADR-0019

## Result

Both web apps log a user in on their own server (Authorization Code with PKCE against the mock issuer), hold the tokens encrypted in the cache Redis, and give the browser only an opaque `HttpOnly` cookie. This was run on this machine, on Windows with Docker Desktop and Node 25.9.0. Nothing was run on Azure; the `session` and `queue` pipeline jobs and the dev Terraform changes have not been run or applied (register items 118 and 119).

## What was run

| Check | Command | Result |
|---|---|---|
| Session package | `npm test` in `packages/web-session`, with `REDIS_CONNECTION_STRING=127.0.0.1:6379` | 104 of 104 pass (13 Redis store tests included) |
| Mock issuer | `dotnet test tools/BakeryMarketplace.slnx` (refresh grant, hardening) | Pass |
| Customer app, mock-backed browser suite | `npm run test:e2e` in `apps/web-customer` (fake issuer, in-memory store) | 64 pass |
| Queue display unit and browser suites | `npm run test:unit`, `npm run test:e2e` in `apps/web-queue-display` | 8 and 19 pass |
| Real stack, app and services as host processes | `node scripts/ci/skeleton-smoke.mjs` | 23 passed (the 21 earlier journeys plus 2 vendor-queue tests); Playwright exit code 0 |
| Real stack, services and customer app as containers | `node scripts/ci/skeleton-smoke.mjs --containers` | 21 passed, run **before** the vendor-queue spec was added. **Not re-run with it.** |
| Gates | `node scripts/ci/node-gates.mjs --tests`, `node scripts/ci/secret-scan.mjs` | Run before the commits; see the commit history |

## What the real-stack runs show

- Login through the real mock issuer's page ends on the app with the user's name shown; the cookie is `HttpOnly` with an opaque 43-character id; no token-shaped string is in `document.cookie`, local or session storage, or the HTML.
- The browser's GraphQL requests carry no `Authorization` header; the server attaches the signed token (the mock BFF records what it received, in the mock-backed suite).
- A reload keeps the login. Logging out ends the session on the server: the old cookie then answers `{ authenticated: false }`.
- A callback URL used a second time finds no pending login and lands on the error page.
- The vendor chain, for the first time as one journey: a customer places an order with an option (status `PLACED`); the vendor logs in on the queue display (port 3100) through the real issuer; the order appears in the New column with its short reference, "2 × Country Sourdough" and "Add seeds", without the customer's id, and stays after a reload. A Customer-role login on the same screen sees the "not a vendor's" message.

## What went wrong on the way

- The first host-mode run failed one test that still assumed "reload ends the login"; the assumption was wrong under ADR-0019 and the test was rewritten (reload keeps it).
- The skeleton journey raced the log-out reload; it now waits for the reload before opening the order link.
- A public query still succeeds after the server ends a session, so the page could not tell; the proxy now sets `x-session-ended`.
- Two apps on `localhost` shared cookies; cookie names and the store prefix now carry the client id.

## Not shown

- The renewal of an access token **on the real issuer** is covered by the package's tests and the mock-backed browser suite (a short-lived token, a refused refresh), not by a long real-stack run.
- The security review that the work item's definition of done requires (cookie, CSRF, session store, logging) has not been done.
- Behaviour after the idle limit (12 hours) or absolute lifetime (7 days) has only been tested with shortened settings.
- Nothing about Azure: the Key Vault secret, the `redis-cache` app and the callback address are unapplied (register item 119); eviction of sessions under memory pressure is an open decision (item 118).
