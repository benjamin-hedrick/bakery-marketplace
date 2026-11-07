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
Node >= 24. The runner finds JDK 17, the SDK and Maestro at their usual Windows places when `JAVA_HOME` and `ANDROID_HOME` are not set. Chrome on a fresh
emulator image shows a first-run screen once; the login subflow dismisses it.

## The Maestro flows (one command)

```
node ../../scripts/dev/mobile-flows.mjs              # from here or the repository root
node ../../scripts/dev/mobile-flows.mjs --no-build   # reuse the build already installed
node ../../scripts/dev/mobile-flows.mjs --flow 03    # one flow
```

It boots the emulator if none is running, starts the backend, builds and installs the app, runs the fourteen flows in
`.maestro/` (login, restart and logout; browse to detail; the order journey; a declined payment keeps the order; an allergy warning that must be acknowledged; no allergy profile; a failed allergy check; an allergy only an option carries; an avoid that needs no acknowledgement; several allergies and choosing which to tell the bakery; a failed checkout request keeps the order and a retry places one order; changing quantities and removing lines; a customer with no saved payment method cannot place an order; a refused session returns to the login screen, which must run last because it restarts the issuer). The allergen flows log in as seeded customers whose saved profiles are seed data (`docs/operations/local-dev.md`, "Seeded customers"). Two steps call a small local control server that the runner starts (`scripts/lib/flow-control.mjs`: read a customer's newest order, count their orders, stop and start the BFF, restart the mock issuer), so those flows only work when started by the runner, not by `maestro test` alone and tears down what it started. The
last result is recorded in `docs/evidence/WI-MOB-001/`; Maestro's own output goes to `artifacts/mobile/` (git-ignored).

The demo (`node ../../scripts/dev/mobile-demo.mjs`) boots the emulator with its window, starts the backend **without** the test hook, builds a non-test
build, installs and opens it, and waits. All scripts: `docs/operations/scripts.md`.

Every flow of a run shares one stack, so **stock is a budget**: the Almond Croissant has 4 units (it is the "low stock" item the rest of the repository relies on), and only flows 05 and 10, which need a tree-nut item, may buy it; the others use the made-to-order items (Oat Milk Latte, Lemon Loaf), the sourdough (12) or the cookies (24). A flow that sells out an item another flow needs fails with that item shown as "Sold out". Keep the machine awake during a run (a Windows standby of 29 minutes once appeared as a 29-minute flow).

## Run it by hand

```
npm ci                                       # here, and in ../../packages/customer-core
node ../../scripts/dev/mobile-stack.mjs      # the backend stack (test hook on) + adb reverse 5100 and 4100; Enter stops it
emulator -avd bakery_pixel -no-snapshot -no-boot-anim -gpu swiftshader_indirect -memory 2048
EXPO_PUBLIC_TEST_HOOKS=1 npx expo prebuild --platform android --no-install   # generates android/ (git-ignored)
cd android && EXPO_PUBLIC_TEST_HOOKS=1 ./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64   # .\gradlew.bat on Windows
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug APK carries its own JavaScript bundle (`plugins/withEmbeddedBundle.js`, register 147), so no dev server is needed and a JavaScript change needs a
new Gradle build. The app reaches the host's issuer (`http://localhost:5100`) and BFF (`http://localhost:4100`) through `adb reverse`, so the issuer URL
equals the `iss` the services expect. Cleartext http exists only in the debug manifests Expo generates; no release build has been made.

The checkout screen has a "Payment method" picker filled from the customer's saved methods (seed data); choosing Alice's "Test card (refused)" is how a declined payment is
reached. There is no test build, switch or hook. Log in as Alice Customer on the issuer's page.

## Checks

```
npm run typecheck      # tsc
npm run format:check   # Prettier
npm test               # unit tests of the session and API logic (WI-MOB-003), no emulator
```
