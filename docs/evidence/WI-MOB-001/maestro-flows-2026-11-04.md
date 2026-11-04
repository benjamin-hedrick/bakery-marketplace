# WI-MOB-001: Maestro flows of the Android customer app, 2026-11-04

> **Status:** Snapshot · 2026-11-04 · one local run on the lead's Windows machine; not a pipeline result.
>
> **Current result:** the one-command run passed, 4 of 4 flows, exit code 0. Single run, single emulator image, a test build; see "Not run" below.

## What ran

`node scripts/dev/mobile-flows.mjs`, from a cold start (no emulator, no containers, no stack): it booted the emulator, started the local stack (Compose
infrastructure, seed, catalog, ordering, BFF with `ENABLE_TEST_HOOKS=1`), set `adb reverse` for the issuer (5100) and the BFF (4100), ran
`expo prebuild` and a Gradle debug build with `EXPO_PUBLIC_TEST_HOOKS=1`, installed the APK, ran the four flows, and tore the stack and the emulator down.
Exit code 0, "every flow passed". The JUnit file is `maestro-junit-2026-11-04.xml` here.

| Flow (`apps/mobile-customer/.maestro/`) | Result | Time | What it proves |
|---|---|---|---|
| `01-login-and-logout.yaml` | passed | 38 s | Login through the real mock issuer in Chrome Custom Tabs (PKCE, the app's registered redirect scheme); the menu shows stock (in stock, low, sold out); a restart keeps the session without a login (refresh token from the Keystore); logout returns to the login screen and a restart does not bring the session back |
| `02-browse-to-detail.yaml` | passed | 23 s | An item opens with its options, and back returns to the menu |
| `03-order-journey.yaml` | passed | 38 s | An item with an option and quantity 2 goes into the order (estimated total 16.00), checkout with a pickup window, the order is placed (status PLACED, 2 x Country Sourdough, total 16.00) and the order is no longer in the cart |
| `04-declined-payment.yaml` | passed | 39 s | A declined test payment says "The payment was declined.", stays on checkout with the order kept (Order (1)); a retry without the decline places the order |

Total flow time 2 m 18 s (137.9 s in the JUnit file). Earlier the same day each flow was also run alone against a hand-started stack; the first run of flow 02
**failed** on a real assertion mismatch (the option's label is "Add seeds (+$1.00)", and Maestro matches the whole text), which is also evidence the runner
reports a failing flow with a non-zero exit. The assertion was corrected, not loosened to pass.

## Versions

| Part | Version |
|---|---|
| Maestro | 2.12.1 |
| Emulator | AVD `bakery_pixel`, Android 35 (google_apis, x86_64), WHPX acceleration, `-gpu swiftshader_indirect`, 2 GB |
| App | Expo SDK 58 (`expo` ~58.0.23), React Native 0.88.1, React 19.3.0, New Architecture; built with JDK 17 and Gradle 9.4.1 for `x86_64` only |
| Host | Windows 11 Home, Node 25.9.0, .NET 10, Docker 29.1.3 |
| Sign-in | ADR-0023: authorization code with PKCE (S256), public client `bakery-mobile`, scope `openid offline_access`, redirect `com.bakerymarketplace.mobile:/auth/callback` |

## Also checked by hand on the emulator (before the flows)

Login, menu, detail, cart, a declined and then a real order, restart without login, sign-out; screenshots were read during the session and are not kept.
The real issuer container answered 200 for the app's redirect scheme and 400 for an unregistered one (`com.evil.app:/cb`).

## Not run, and what the result does not show

- **Not on iOS, not on a real device, not on another Android version or image.** One emulator image, one run; no repeat run to measure flakiness (the web suite has `repeat-suite.mjs`; there is none for these flows).
- **Not in the pipeline.** Local only by the lead's decision (register 148).
- **The app under test is a test build** (the decline switch is compiled in) talking to a BFF with the test hook on. A release build was never made or run; cleartext http exists only in the debug manifests.
- **No accessibility, visual, performance or offline checks.** The app never ran against a real identity provider (the mock issuer only).
- **Not covered by a flow:** a refresh that the issuer refuses (back to the login screen), a refresh after the access token expires, a failed network, sold-out items, the stock shortfall message, the pickup window rejection, the allergen acknowledgement (not built, register 146).
- **Chrome's first-run screen** ("Use without an account") was dismissed by the login subflow only when it appears; the log of the declined-payment flow shows the dismissal step skipped (the screen was not there, an earlier manual run on this emulator image had dismissed it); the other three logs were not checked for this.
- The Gradle build in this run reused the cached build state of earlier runs; the first cold build of the day took 10.5 minutes.
- The JUnit file holds the result only; Maestro's own debug output (screenshots, command log) is in the git-ignored `artifacts/mobile/maestro-debug/`.

## Findings, in the register

145 (a refresh token cannot be revoked at the mock issuer), 146 (no allergen acknowledgement in the app), 147 (Metro dev server did not connect from the
emulator; the debug build embeds its bundle; `react-native-safe-area-context` breaks the Windows CMake path), 148 (local-only flows and their dependence on
the emulator image).
