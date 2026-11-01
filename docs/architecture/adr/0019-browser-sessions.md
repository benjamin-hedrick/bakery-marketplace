# ADR-0019: Browser Sessions: a Server-Side Session Behind an HttpOnly Cookie

**Status:** Proposed (2026-11-02). If accepted it amends ADR-0006 (token storage: "header-only, no cookies" no longer applies between the browser and its web app) and ADR-0012 (the Next.js server now holds tokens), and resolves register items 24 and 116, enables 26, and removes the duplication in 115. Auth logic: needs the lead's approval before anything is built. This is the decision the backlog reserved the number 0019 and the item `N-01` for.

## Context

The browser apps log in with Authorization Code and PKCE done entirely in the page (ADR-0006, ADR-0012). The access token lives in the page's memory, expires after an hour, and there is **no refresh token** (register item 24). The consequences, now concrete:

- **A reload logs the user out.** Annoying for a customer; for the vendor's queue display (`WI-QUE-002`, built 2026-11-02) it is a defect: a counter or kitchen screen is unattended, has no keyboard, and sleeps and reloads. It has to be logged in again by hand several times a day (item 116).
- **Push (ADR-0021) needs a long-lived authenticated connection.** The browser's `EventSource` cannot send a bearer header; a streamed `fetch` can, but the page must then hold the token and the stream ends when the token does.
- **The login code exists twice** (about 600 lines copied from `web-customer` into `web-queue-display`, item 115), and any further auth work would be done twice.
- **The token is readable by any script in the page.** In memory is better than `localStorage`, but a cross-site scripting flaw still reads it.
- **The mock issuer has no refresh grant,** and the browser's token exchange needs the issuer to allow the app's origin for cross-origin requests (`MockOidc__AllowedOrigins`).

Constraints: every service still validates the bearer token itself (ADR-0006, ADR-0008); secrets stay out of files and are validated at startup (ADR-0007); the browser talks to the BFF only through its own web app (ADR-0013); local development runs with plain `http://localhost`.

## Decision (proposed)

1. **The web app's server owns the login and holds the tokens** (the "backend for frontend" pattern for browser apps). `/api/auth/login` starts Authorization Code with PKCE (the verifier is kept server-side, bound to the browser by a short-lived signed cookie); `/api/auth/callback` checks the state, exchanges the code **from the server**, and creates the session. A new session id is created at every login (no session fixation).

2. **The browser holds only an opaque session id,** in a cookie: `__Host-bakery-session`, `HttpOnly; Secure; SameSite=Lax; Path=/` and no `Domain`. The `__Host-` prefix needs HTTPS, so plain-HTTP local development uses a configured unprefixed, non-`Secure` name; the setting is explicit and the app **refuses to start in production without HTTPS**. The id is 256 random bits and means nothing by itself.

3. **Tokens are stored server-side, encrypted.** A session store behind an interface (the repository's adapter pattern): a Redis implementation, an in-memory one for tests, one contract-test base. Each session holds the access token, the refresh token and the identity claims, encrypted (AES-GCM, key from configuration under ADR-0007, with a key id so it can be rotated). The record expires at the session's absolute lifetime. An index per subject allows "end every session of this person" (a vendor suspended, a leaked device).

4. **Renewal is invisible and happens on the server.** Before the access token expires (60 seconds of margin) the server refreshes it with the refresh-token grant, **once per session at a time** (single-flight, across instances by a short lock), and stores the rotated refresh token. A refused refresh, or a refresh token used twice, **ends the session** (reuse is treated as theft). The issuer's refresh lifetime is a ceiling on the session.

5. **Requests carry the cookie only.** The browser calls `/api/graphql` (and, for ADR-0021, the stream route) with its cookie; the route loads the session, renews if needed, and attaches `Authorization: Bearer` to the call to the BFF. The BFF and the services are unchanged. For ADR-0021 this removes the token-in-a-header problem: the cookie is sent automatically, a stream can be re-opened after the token's expiry without the user noticing, and the maximum age of a stream follows the token's life.

6. **CSRF.** The cookie is `SameSite=Lax`, so a cross-site form post does not carry it. Additionally every request that is not a `GET` to the app's API routes must carry an `Origin` equal to the app's own origin and `Content-Type: application/json` (a type a cross-site form cannot send); anything else is refused with 403. A `GET` never changes state.

7. **Lifetimes (defaults, configurable):** an idle timeout of 12 hours and an absolute lifetime of 7 days, both bounded by the issuer's refresh lifetime. A kitchen screen therefore needs a human login about once a week, not several times a day.

8. **Logout** deletes the session record and clears the cookie, then the page is reloaded so nothing the previous user fetched stays in memory (as today). `GET /api/auth/me` returns the name, roles and session expiry for display; it carries no token and no decision depends on it.

9. **The mock issuer gains the refresh-token grant:** opaque refresh tokens issued with the `offline_access` scope, rotated on every use, with reuse detection (a reused token revokes the family), an expiry, and a configurable lifetime. Its browser CORS allowance is no longer needed for login, because the exchange moves to the server; the registered redirect addresses still are. The cloud issuer (Microsoft Entra External ID) supports the same grant.

10. **The code is written once,** as a workspace package used by both web apps (resolving item 115). The first step is extracting what the two apps share, with the existing unit tests as the safety net.

## Options considered

| Option | Verdict |
|---|---|
| A refresh token in the browser | In memory it is lost on reload, which is the problem; in storage it is readable by any script and reopens ADR-0006's analysis. Rejected |
| Silent renewal in a hidden iframe | Depends on third-party cookies, which browsers are removing. Rejected |
| A stateless encrypted cookie holding the tokens | No Redis and no store to run, but a size limit (about 4 KB), no server-side revocation, and a refresh-token rotation race between tabs. The fallback if a session store is unwelcome |
| A device credential for the queue screen (client credentials scoped to one vendor's queue) | Solves the unattended screen only, and makes a non-person an owner of a vendor's data; changes the ownership model. Possible later; not this decision |
| Keep the in-memory token and ask people to log in | The status quo |

## Consequences

- **Easier:** a reload keeps the login; the vendor screen survives a week; push authenticates with a cookie (even `EventSource` would work); tokens are out of reach of page scripts; sessions can be ended by the server; pages that need the user's identity on the server (item 26) become possible; one implementation instead of two.
- **Harder:** the web apps gain state (a Redis connection and an encryption key, both new secrets/configuration, ADR-0007); a CSRF duty that the header-only design did not have; a login that spans three parties (browser, web server, issuer) with the issuer's token endpoint reached by the server (in containers at a different address from the one the browser uses); a stolen cookie is a stolen session until it expires or is ended (mitigated by HttpOnly, Secure, a short idle time and the subject index); and a script that runs in the page can still act as the user, which it could before.
- **Not changed:** the services, the BFF, the bearer header between the web app and the BFF, and the rule that every service validates the token itself.
- **Operational:** if the session store is lost (a Redis restart) everyone logs in again; acceptable at this scale and recorded.

## Open points for the lead

1. **Lifetimes:** idle 12 hours and absolute 7 days, bounded by the issuer.
2. **The cloud client type:** a server-side client for Entra External ID can be a public client with PKCE (no secret to keep, ADR-0007's preference, but shorter refresh lifetimes) or a confidential client with a certificate or secret. To be decided with `AUTH-004`.
3. **Which Redis:** the session store should not share the events Redis (no persistence, trimmed streams). The cache Redis of the `with-redis` profile is the candidate.
4. **Approval of the auth work itself:** the mock issuer's refresh grant, the server-side exchange, and the amendments to ADR-0006 and ADR-0012.
