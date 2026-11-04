# mobile-customer (WI-MOB-001)

The customer's Android app: Expo (React Native, TypeScript), a thin client of the same GraphQL BFF as `web-customer`. Android only, local only
(nothing is deployed, there is no CI for it, and no store build). Sign-in is decided in ADR-0023.

What it does: sign in (system browser, PKCE), the menu with stock, an item with its options, the order (quantities, remove), checkout (pickup time,
idempotency key; a declined or failed payment keeps the order), and the status of the order just placed. It shares the cart, checkout input and
wording with the web app through `packages/customer-core`; it does not use Relay (plain `fetch` to the BFF, `src/api.ts`).
The allergen acknowledgement at the cart is **not** built (the BFF does not require it to place an order; follow-up, see the register).

Tokens: the access token lives in memory; the refresh token lives in the Android Keystore (`expo-secure-store`) and is deleted on sign-out or when
the issuer refuses it (`src/auth/session.ts`). A network failure never deletes it. The cart is not kept after sign-out or a restart.

## Prerequisites (Windows, one time)

JDK 17 (`JAVA_HOME`), the Android SDK (`ANDROID_HOME`, platform-tools on `PATH`), the AVD `bakery_pixel`, Maestro 2.12.x, Docker, the .NET SDK and
Node >= 24. How they were installed is in `docs/evidence/WI-QA-003/` and `docs/operations/local-dev.md`.

## The Maestro flows (one command)

```
node ../../scripts/dev/mobile-flows.mjs              # from here or the repository root
node ../../scripts/dev/mobile-flows.mjs --no-build   # reuse the test build already installed
node ../../scripts/dev/mobile-flows.mjs --flow 03    # one flow
```

It boots the emulator if none is running, starts the backend (test hook on), builds and installs the app as a test build, runs the four flows in
`.maestro/` (login, restart and logout; browse to detail; the order journey; a declined payment keeps the order) and tears down what it started. The
last result is recorded in `docs/evidence/WI-MOB-001/`; Maestro's own output goes to `artifacts/mobile/` (git-ignored).

## Run it by hand

```
npm ci                                       # here, and in ../../packages/customer-core
node ../../scripts/dev/mobile-stack.mjs      # the backend stack (test hooks ON) + adb reverse 5100 and 4100; Enter stops it
emulator -avd bakery_pixel -no-snapshot -no-boot-anim -gpu swiftshader_indirect -memory 2048
npx expo run:android                         # prebuilds android/ (git-ignored), builds the debug app, installs it, starts Metro
```

The app reaches the host's issuer (`http://localhost:5100`) and BFF (`http://localhost:4100`) through `adb reverse`, so the issuer URL equals
the `iss` the services expect. Cleartext http exists only in the debug manifests Expo generates. In a debug build the checkout screen shows a
"Test: decline the payment" switch, which sends the BFF's test header (the BFF honours it only when started with `ENABLE_TEST_HOOKS=1`).

Log in as any customer on the issuer's page (for example Alice Customer).

## Checks

```
npm run typecheck      # tsc
npm run format:check   # Prettier
```
