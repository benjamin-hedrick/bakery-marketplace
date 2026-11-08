# WI-MOB-003: unit tests of the Android app's session and API logic (2026-11-05)

> **Current result (2026-11-05):** 25 of 25 unit tests of the Android app's session and API logic passed; register 151 was fixed with the lead's approval and 152 is open. The tests run in the pipeline's `mobile` job, which was written and has not yet run on Azure.

Part 1 of `WI-MOB-003` (the unit tests). The Maestro flows (refused session, failed checkout request, order edits) are part 2 and are not in this record.

## What ran

| | |
|---|---|
| Command | `npm test` in `apps/mobile-customer` (Node's test runner with `--experimental-transform-types` and the loader in `tests/register.mjs`) |
| Versions | Node v25.9.0, Windows 11; no emulator, no Docker, no network |
| Result | 25 tests: **25 passed, 0 failed**. First run 24 passed and 1 todo that failed by design (register 151); after the lead approved the fix, 25 passed |
| Code under test | `src/auth/session.ts` (one line added for register 151), `src/api.ts` unchanged |

How the app's modules load in Node: `tests/hooks.mjs` maps `expo-secure-store`, `expo-web-browser` and `expo-crypto` to the fakes in `tests/fakes/` (the Keystore is a map that records every call; the browser answers what the test says; crypto is Node's SHA-256) and resolves the app's extensionless imports to `.ts`. `fetch` is replaced per test by a script that records every request. The clock is Node's mock `Date`. Each test loads a fresh copy of the session and API modules (`?inst=n`), because the session keeps its state in module variables. No product code was moved; the only product change is the one line for register 151.

## What is covered

| Spec case | Tests | Outcome asserted |
|---|---|---|
| About to expire is renewed, a valid token is not | 1 | no renewal at 31 s left, one at 29 s left, the renewal sends the stored refresh token |
| Several requests, one renewal | 1 | six concurrent calls, one POST to `/token`, all get the same token |
| Rotation | 1 | the new refresh token is stored; an answer without one keeps the old |
| Issuer refuses (400) | 3 | token deleted (the only delete is the refresh key), no access token; also in mid-session; no stored token means no request |
| Issuer unreachable | 2 | at start-up: no session, token kept; mid-session: token kept, next attempt works without a login |
| Issuer 5xx | 1 | the token is kept (register 151; failed before the fix, and fails again with the line removed) |
| UNAUTHENTICATED (401 and the GraphQL code) | 5 | renewed once and retried once with the new token; a second one is an error after exactly one renewal and two BFF calls; a refused renewal signs out and does not retry; a public read never renews |
| Login callback | 6 | wrong state, missing state, no code, cancelled and dismissed browser, refused exchange: no session, nothing stored, no exchange attempted where there is no code; a good return: S256 challenge equals the hash of the verifier that was sent, only the refresh token is written (the one `set` call), nothing is logged |
| Other | 4 | other GraphQL errors keep their code and do not renew; an unreachable BFF keeps the session; no session fails before any request; sign-out clears both tokens |

## Do the tests fail when the behaviour breaks

One-line mutations of `src/`, each run and then reverted (`git diff` of `src/` is empty after):

| Group | Mutation | Result |
|---|---|---|
| Renewal | `EARLY_MS` 30 000 to 0 | 1 failed |
| Concurrency | `refreshing ??=` to `refreshing =` | 1 failed |
| Refusal | a refusal no longer deletes the token | 3 failed |
| Unreachable | a network error treated as a refusal | 2 failed |
| Callback | the `state` comparison removed | 2 failed |
| Retry | the retry no longer depends on the renewal's result | 1 failed |
| Rotation | the new refresh token is not stored | 5 failed |

## Findings

- **Register 151 (fixed 2026-11-05 with the lead's approval):** an issuer 5xx deleted the refresh token; `postToken` now treats a status of 500 or more as unreachable.
- **Register 152:** after a rejected retry the app stays signed in; the tests assert the current behaviour.

## Not covered here

An access token expiring in a running app is covered by these unit tests only (the mock issuer's token lives an hour, so a flow cannot wait for it). That the Keystore really encrypts the token, and the real Custom Tabs hand-over, are not tested by fakes; the existing Maestro flows exercise the hand-over.
