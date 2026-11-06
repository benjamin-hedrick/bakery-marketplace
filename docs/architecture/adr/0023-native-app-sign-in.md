# ADR-0023: Native App Sign-In: Authorization Code with PKCE in the System Browser, Tokens on the Device

**Status:** Accepted (2026-11-04) by the lead, who chose option A over a dev-only shortcut and accepted the text. It changes the mock issuer's redirect rule and adds a token store on a device (auth logic). It extends ADR-0006 (token validation stays in every service) and ADR-0019 (browser sessions; the refresh grant is reused). It does not change either decision text.

## Context

The customer web app logs in on its own server and keeps a cookie session (ADR-0019). A native app has no such server: it is the client. `WI-MOB-001` adds an Android customer app (Expo, React Native) that calls the same GraphQL BFF. The questions are how the app signs in and where it keeps the tokens.

What already holds:

- The BFF takes `Authorization: Bearer` and forwards it unchanged to the services, which validate it and the ownership themselves (ADR-0006, ADR-0008). **No BFF or service auth change is needed.**
- The mock issuer already supports Authorization Code with PKCE (S256), the `offline_access` scope and the `refresh_token` grant, and treats a client that sends no secret as a public client.
- The issuer refuses any `redirect_uri` that is not on its registered list, compared exactly, and accepts only absolute `http`/`https` addresses. A native app cannot receive an `http` redirect.

## Decision

1. **Standard native flow (RFC 8252):** the app opens the issuer's authorize page in the system browser (Android Custom Tabs, via `expo-auth-session`/`expo-web-browser`), never in an embedded web view, with PKCE S256 and a random `state`. The code comes back on the app's redirect address and is exchanged at the token endpoint by the app.
2. **A registered public client `bakery-mobile`:** no secret. The scope is `openid offline_access`.
3. **Redirect address:** a private-use scheme in reverse-domain form, `com.bakerymarketplace.mobile:/auth/callback`. The one change to the issuer: `ValidateRedirectUri` also accepts an absolute URI whose scheme is a private-use scheme **containing a dot** (RFC 8252 section 7.1), with no fragment and no credentials, and no wildcard. The comparison stays exact against the registered list. The `http`/`https` rule for every other address is unchanged. The address is **not** in `DefaultRedirectUris`: the local Compose file and the demo script register it through `MockOidc__RedirectUris__n`, so a deployed dev issuer does not accept it unless configured.
4. **Tokens on the device:** the access token is kept in memory. The refresh token is kept in the Android Keystore through `expo-secure-store`, and is used to get a new access token before and after expiry (the issuer renews it on use, ADR-0019). Logging out deletes it. Nothing is written to plain storage or logs.
5. **The app sends the access token as a bearer to the BFF** and handles a 401/UNAUTHENTICATED by refreshing once, then by sending the customer to the login screen. Cart and order data are not cached on the device beyond the running session (ADR-0014).
6. **Local transport:** the emulator reaches the host's `localhost` services through `adb reverse`, so the issuer URL the app uses equals the `iss` the services expect. Cleartext `http` is enabled **only in debug builds** for this, through the Expo build properties, never in a release build.

## Consequences

- The issuer gains one narrow, tested rule (a dotted private-use scheme, exact match); the tests that prove an unregistered, prefix, case-different or fragment-carrying address is refused must still pass and be extended for the new form.
- A refresh token is long-lived and sits on a device: the device's lock and the Keystore are the protection. A stolen device's refresh token works until it expires or the user logs out; there is no server-side revocation in the mock issuer (register entry to be added with the build).
- The mock issuer does not require PKCE for a public client (existing behaviour of the mock); the app always sends it. A real tenant (Entra) would enforce it.
- iOS would need its own scheme registration and a Mac; out of scope.
- Real Entra: the same flow works with a registered mobile redirect; nothing here is deployed.

## What has been built, against these decisions

Built and run locally on 2026-11-04 (`WI-MOB-001`, evidence in `docs/evidence/WI-MOB-001/`); nothing is deployed and the app has never run against a real identity provider.

- **1 (system browser, PKCE S256, random state):** built (`apps/mobile-customer/src/auth/`, `expo-web-browser` opens Chrome Custom Tabs; the app checks `state`). Run: the Maestro flows log in through the real issuer container.
- **2 (public client `bakery-mobile`, scope `openid offline_access`):** built; the mock issuer treats a client with no secret as public, as before.
- **3 (redirect address):** built. `ValidateRedirectUri` accepts a private-use scheme with a dot, exact match, no fragment, credentials or wildcard; tested in `MockOidcAuthorizeHardeningTests` (unregistered, prefix, case, fragment, `//` form and non-dotted schemes refused). The address is registered through `MockOidc__RedirectUris__2` in `docker-compose.yml`, not in `DefaultRedirectUris`; the live container answered 200 for it and 400 for an unregistered scheme. The lead has not yet reviewed this auth change in a PR.
- **4 (tokens on the device):** built. Access token in memory only; refresh token in the Keystore through `expo-secure-store`; deleted on sign-out or when the issuer refuses it. A network failure keeps it (a choice made in the build, not in this ADR). Run: restart without login, and sign-out followed by a restart. Not run: a refresh the issuer refuses, expiry of the access token.
- **5 (bearer to the BFF, refresh once, then the login screen; nothing cached):** built in `src/api.ts` (plain `fetch`, no Relay). The cart is not kept after sign-out or a restart. The refresh-once path is not covered by a flow.
- **6 (local transport):** built. `adb reverse` for 5100 and 4100 (`scripts/dev/mobile-stack.mjs`); cleartext http exists only in the debug manifests Expo generates. The debug APK embeds its bundle (register 147). No release build was made.
- **No revocation on request (sign-out, lost device):** recorded as register 145. Reuse of a rotated refresh token does revoke the login at the mock issuer.

**Note 2026-11-06 (register 152, amends the as-built text of decision 4 and 5, not the decision):** the refresh token is also deleted, and the app returns to the login screen, when the BFF rejects an access token the issuer has just issued (the retry after a renewal answers UNAUTHENTICATED again). Reason: a user stuck on error screens is worse than a login prompt, and a fresh sign-in gets a fresh token. An unreachable issuer still keeps the token. Built in `src/api.ts`; tested in `apps/mobile-customer/tests/api.test.ts`.
