> **Status:** In progress · remaining: phases 3 and 4 (phases 1 and 2 are built; see the progress notes under this banner)

> **Progress note (2026-11-02):** ADR-0019 is Accepted and the lead approved the auth work. **Phase 1 built:** the mock issuer's `refresh_token` grant (`tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`): a refresh token is issued to a login that asked for `offline_access`; it is opaque, single use and rotated on every use; a token used twice revokes the whole login; each token expires (default 8 hours, `MockOidc__RefreshTokenMinutes`) and each use renews it; a token is refused to another client; the user and roles are read from the registry on every refresh, never from the request. Access tokens now carry a unique `jti`. 12 new tests in `RefreshTokenGrantTests.cs`; the Auth project has 175 passing. Not yet used by any app.

> **Progress note (2026-11-02, phase 2):** the shared package `packages/web-session` is built and tested on its own; **no app uses it yet** (phase 3). A `file:` dependency, not an npm workspace, so each app still installs on its own and the Dockerfiles only need the folder copied. It holds: the session settings read from the environment and validated at start (HTTPS or loopback, a 32-byte key, the Redis address); AES-256-GCM sealing with the record id as associated data and a key id for rotation; the session store behind one interface with a memory and a Redis implementation (both run through one contract: expiry, delete, end by person, one-use pending login, an exclusive renewal lock, ciphertext at rest, a wrong key or a copied record reads as missing); the server-side login (PKCE, state, a pending-login record, a code exchange with no secret, a new session id each login); renewal 60 seconds before expiry, once per session across instances, with the failure cases (a refusal ends the session, an outage keeps a token that still works); the cookie helpers (`HttpOnly`, `SameSite=Lax`, `__Host-` and `Secure` except on loopback HTTP); the CSRF checks; and the handlers (`login`, `callback`, `logout`, `me`, and the GraphQL proxy, which drops any `Authorization` header the browser sends and attaches the session's). 98 tests: 85 without Redis, all 98 with it. Added to `node-gates.mjs` and the pipeline (`session` job, written, not yet run on Azure). Not yet done: moving the two apps onto it and deleting their copies (phase 3), the browser tests and the real-stack run (phase 4).

```
WI ID:               AUTH-007
Title:                Browser sessions: a server-side session behind an HttpOnly cookie (backlog N-01)
Type:                 Service Implementation
Epic:                 EPIC-AUTH
Shared with epic(s):  EPIC-WEB-CUSTOMER, EPIC-QUEUE-DISPLAY
Hat/Owner:            Engineering/Build, Security
Status:               In progress
Size:                 L
```

**Context / Why**
The browser apps keep the access token in page memory with no refresh token, so a reload logs the user out and the token ends after an hour (register item 24). The vendor's queue display is unattended and cannot log itself in again (item 116); the planned push (ADR-0021) needs a long-lived authenticated connection; and the login code is copied between the two apps (item 115). ADR-0019 proposes a server-side session behind an HttpOnly cookie, with renewal on the server. This item builds it. It is the backlog's `N-01`.

**Inputs / References**
- *Decisions*: ADR-0019 (the design and its open points), ADR-0006 (token validation stays in every service; the "no cookies" storage rule is amended for the browser-to-web-app hop), ADR-0012, ADR-0013, ADR-0007 (the encryption key and the session store connection are secrets/configuration), ADR-0021 (the stream authenticates with the same cookie).
- *Code*: `apps/web-customer/src/lib/auth/`, `apps/web-queue-display/src/lib/auth/` (the two copies), `apps/*/src/pages/api/`, `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`, `tests/unit/auth*.test.ts`, `tests/e2e/login.spec.ts`.
- *Register*: items 24, 26, 115, 116.

**Out of scope**
- Server-rendering authenticated pages (item 26): made possible, not built.
- A device credential for unattended screens (ADR-0019, options).
- The cloud tenant (`AUTH-004`) and its client type, beyond keeping the code correct for a public or a confidential client.
- Any change to the services or the BFF: they keep validating the bearer token.

**Requirements / Acceptance Criteria**

*Phase 1: the mock issuer's refresh grant (`tools/BakeryMarketplace.Auth`)*
- `refresh_token` appears in `grant_types_supported`. A code exchange with the `offline_access` scope returns an opaque `refresh_token`; without that scope it does not.
- Using a refresh token returns a new access token and a **new** refresh token; the old one stops working. Using an old one again revokes the whole family (every later token of that login) and answers `invalid_grant`.
- Refresh tokens expire (configurable; default 8 hours locally); an expired, unknown or other-client token answers `invalid_grant`. A refresh grant never widens the roles of the original login.
- Auth tests cover each of these, including reuse and expiry.

*Phase 2: the shared package (`packages/web-session`, an npm workspace used by both apps)*
- Extraction first: the code the two apps share moves into the package with the existing unit tests, and both apps' suites pass before and after.
- A session store interface with a Redis implementation and an in-memory one, and one contract-test base both pass: create, read, touch (idle), delete, delete by subject, absolute expiry, and a lock for single-flight renewal.
- Tokens at rest are AES-GCM encrypted with a key from configuration (a missing or short key stops startup, ADR-0007); a record read with the wrong key is a miss, not an error that echoes anything.
- The pending login (PKCE verifier and state) is a ten-minute record in the same store under a random id carried in a short-lived HttpOnly cookie; nothing is signed.
- Cookie: `__Host-` name with `HttpOnly; Secure; SameSite=Lax; Path=/` and no `Domain`; the unprefixed form only when explicitly configured for local HTTP; production without HTTPS refuses to start.
- Handlers: `login` (PKCE, state, the verifier server-side), `callback` (state and verifier checked, server-side exchange, new session id, return-to checked as today), `logout`, `me`.
- Renewal: refresh 60 seconds before expiry, once per session at a time across instances; a rotated refresh token is stored; a refused or reused refresh ends the session; the user is sent to log in.
- CSRF: a non-`GET` API request without an `Origin` equal to the app's origin, or without `Content-Type: application/json`, is a 403 and changes nothing.
- No token, session id or code appears in a log line, an error body, a URL or the browser's storage.

*Phase 3: the apps*
- `web-queue-display` first, then `web-customer`: the browser-side PKCE, session and token code is removed; `/api/graphql` loads the session, renews, and attaches the bearer header; the Relay environment sends no `Authorization`; `RequireLogin` and the header use `me`.
- A reload keeps the user logged in. A screen left idle past the idle timeout, or past the absolute lifetime, asks for a login. Logging out ends the session on the server (the old cookie then opens nothing) and reloads the page.
- The mock issuer's browser CORS allowance is no longer needed for login; the registered redirect addresses still are.

*Phase 4: evidence*
- Browser tests: login, reload stays logged in, the access token expires and is renewed without the page noticing, a refused refresh asks for a login, logout, a forged cross-origin post is refused, the cookie's attributes, nothing token-like in storage or the HTML.
- A run on the real stack (the real mock issuer, both apps) recorded in `docs/evidence/`.
- Amendment notes appended to ADR-0006 and ADR-0012; `docs/operations/local-dev.md` updated (the issuer's token address as the server reaches it); register items 24, 26, 115 and 116 closed or updated.

**Dependencies**
- Blocked by: the lead's approval (auth logic); ADR-0019 accepted.
- Blocks: the stream authentication in ADR-0021 (`WI-QUE-003`) is simpler after it, but does not strictly need it.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: a security review of the change (cookie, CSRF, session store, logging) before it is called done.

**AI-agent suitability**
Parts. The mock issuer and the package are well specified; the cookie, CSRF and renewal logic are security-sensitive and need the lead's review of each phase.

**Open Points (working)**
*(none: the four open points of ADR-0019 were decided on 2026-11-02)*
