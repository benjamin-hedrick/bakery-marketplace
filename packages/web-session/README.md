# @bakery/web-session

The server-side browser session shared by the web apps (ADR-0019, `WI-AUTH-007`). The browser holds an opaque, HttpOnly cookie; the web app's server holds the tokens, encrypted, renews them, and puts the bearer header on the call to the BFF.

**Status (2026-11-02): phase 2 built and tested on its own; no app uses it yet.** Phase 3 moves `web-queue-display` and then `web-customer` onto it and removes their browser-side token code.

## What is in it

| Module | What it does |
|---|---|
| `config.ts` | Reads and validates the environment (below). Plain HTTP is accepted only for a loopback origin. |
| `crypto.ts` | AES-256-GCM sealing; the record id is the associated data; a key id allows rotation. |
| `store.ts` | The session store interface; a memory store and a Redis store (the cache Redis). |
| `oidc.ts` | The authorize address, the code exchange and the refresh grant against `<issuer>/token`. A public client with PKCE. |
| `service.ts` | `startLogin`, `finishLogin`, `resolve` (idle and absolute limits), `bearerFor` (renewal, once per session across instances), `logout`, `endSessionsOf`. |
| `handlers.ts` | The API routes: `login`, `callback`, `logout`, `me`, the `graphql` proxy and, for a screen with live updates, `createGraphqlStreamHandler` (`/api/graphql-stream`: the same session, CSRF and renewal checks, then the BFF's event stream relayed as it arrives and ended when the session ends). |
| `csrf.ts`, `cookie.ts` | The origin and content-type checks; the cookie attributes. |
| `runtime.ts` | `getSessionRuntime()`: one runtime per process, built from the environment. |

## Settings (environment)

| Variable | Meaning |
|---|---|
| `AUTH_ISSUER` | The issuer as the **browser** reaches it (where the login page is). |
| `AUTH_ISSUER_INTERNAL` | The issuer as this **server** reaches it, when that differs (a container network). Default: `AUTH_ISSUER`. |
| `AUTH_CLIENT_ID` | The public client id. |
| `APP_ORIGIN` | This app's own origin, e.g. `http://localhost:3100`. The redirect address (`<origin>/api/auth/callback`) and the CSRF check come from it. HTTPS gives the `__Host-` cookie names and `Secure`; HTTP is accepted only on `localhost`, `127.0.0.1` or `[::1]`. |
| `SESSION_ENCRYPTION_KEY` | 32 random bytes, base64url, optionally `<id>:<key>`. `node scripts/dev/init-env.mjs` generates one locally (ADR-0007 for the cloud). |
| `SESSION_ENCRYPTION_KEY_PREVIOUS` | The key before a rotation, with a different id, while old sessions may exist. |
| `SESSION_REDIS_URL` | The session store's Redis, e.g. `redis://127.0.0.1:6379`. `memory` (sessions in the process; tests and demos) needs `SESSION_ALLOW_MEMORY_STORE=1` **and** a loopback `APP_ORIGIN`; anywhere else it is refused (register 122). |
| `SESSION_REDIS_PREFIX` | Optional key prefix (default `web-session:<client id>`). |
| `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS` | Defaults 720 (12 hours) and 168 (7 days). |
| `GRAPHQL_URL`, `GRAPHQL_EXTRA_FORWARDED_HEADERS` | As before: the BFF address, read on every request, and test-only headers to forward. |

A missing or malformed setting stops the routes with a 503 and logs the **name** of the setting, never a value.

## Using it from an app (phase 3)

Each app mounts the handlers as thin API routes, for example `pages/api/auth/login.ts`: `export default (req, res) => getSessionRuntime()...auth.login(req, res)`, and `/api/graphql` as `runtime.graphql`; a live screen also mounts `pages/api/graphql-stream.ts` (`apiRoutes.graphqlStream`, with `config = { api: { bodyParser: false, responseLimit: false } }`). The Next config lists the package in `transpilePackages`, because it ships TypeScript source. Both GraphQL routes turn the framework's body parser off and read the request themselves, at most `MAX_REQUEST_BODY_BYTES` (64 KB, the BFF's own limit); a larger body is a 413 and nothing is sent on. The stream route (`createGraphqlStreamHandler`) also reads its body before it counts the stream, allows 5 streams per login (`maxPerSession`; a sixth is a 429) and 500 per process (`maxOpen`; a further one is a 503), and ends an open stream when its session ends: the session is checked every 10 seconds (`sessionCheckMs`), less often after each failed check, and the stream is ended after three failures in a row (`maxFailedChecks`).

## Tests

```
npm ci
npm run typecheck
npm test                                   # 85 tests; the 13 Redis store tests are skipped
REDIS_CONNECTION_STRING=127.0.0.1:6379 npm test   # all 98, with the Redis store run against a real Redis (docker compose up -d redis-events)
```

Node strips types when it runs the tests, so the code avoids TypeScript-only runtime syntax (parameter properties, enums).

## Security notes

- No token, session id or authorization code is ever logged, put in a URL, an error body or a cookie value (the cookie holds an opaque random id). Tests assert this for the log and the cookies.
- The browser's own `Authorization` header is dropped by the proxy; the bearer header is always built from the session.
- A renewal that comes back for another person ends the session; a refused or reused refresh ends it; an outage keeps a token that still works and never ends the session.
- Ending every session of one person: `service.endSessionsOf(subject)`.
