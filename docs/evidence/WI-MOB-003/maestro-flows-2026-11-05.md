# WI-MOB-003: the three new Maestro flows (2026-11-05)

Part 2 of `WI-MOB-003` (the unit tests are in `unit-tests-2026-11-05.md`).

## What ran

| | |
|---|---|
| Command | `node scripts/dev/mobile-flows.mjs --flow 1` (the flows whose names start with 1: 10, 11, 12 and 13), emulator `bakery_pixel`, the local stack on the host, debug APK with the test hooks, Windows 11, Node v25.9.0 |
| Result | **4 of 4 passed** on the first run: 10 (an existing allergen flow, run for company), 11 failed checkout request (49 s), 12 order edits (57 s), 13 refused session (41 s). Raw results: `maestro-junit-2026-11-05.xml` |
| Not done | all thirteen flows in one run from a cold start: flows 01 to 09 were not re-run after the app's one-line session change (register 151) and the new flows were added. Flow 13 restarts the issuer, so it is the last flow of a run |

## The flows

| Flow | What it shows |
|---|---|
| 11 failed checkout request | Alice puts a latte in the order and opens checkout; the runner stops the BFF; "Place order" says "The order could not be placed. Please try again." and keeps the order (`Order (1)`, no order page); Alice's order count is unchanged; the BFF comes back; the retry places the order, the cart is empty, and the order count is exactly one more than before |
| 12 order edits | quantity up twice and down twice with the estimated total following ($5, $10, $15, $10, $5); a second line (bread with an option) and the total ($13); removing the first line leaves the bread ($8); removing the last line shows the empty order |
| 13 refused session | login; the runner restarts the issuer's container (it keeps refresh tokens in memory, so it forgets all of them); the app is stopped and started; the login screen is shown, not the menu and not "Signed in as" |

## Do the flows fail when the behaviour breaks

One-line mutations of the app, each run with its flow alone (rebuilt and installed), then reverted (`git status` shows no change under `src/` afterwards):

| Flow | Mutation | Result |
|---|---|---|
| 11 | a failed request also clears the order (`CheckoutScreen.tsx`) | **Failed**: "id: checkout-rejection is visible" is false |
| 12 | the "−" button adds one (`CartScreen.tsx`) | **Failed**: "Estimated total $10.00" is visible is false |
| 13 | a refusal no longer ends the session (`session.ts`) | **Failed**: "id: login-button is visible" is false |

## What these flows do not show

- **One order, by idempotency:** the BFF is away, so the first attempt never reaches the ordering service. "One order after the retry" shows that nothing was placed twice by the app's retry; it does not exercise the idempotency key against a lost answer (an answer lost after the order was placed). The key's reuse is a customer-core and ordering concern (first-slice contract D-6) and is tested there.
- **The stored token being deleted:** flow 13 shows the login screen after a refusal. It would also show it if the token were kept and refused again at each start. That the token is deleted is asserted by the unit tests on the Keystore fake. A flow cannot read the Keystore.
- **An expired access token:** only the unit tests (the mock issuer's token lives an hour).
- **A 5xx from the issuer:** only the unit tests (register 151).

## Test tooling added (register 150)

`GET /order-count` and `POST /issuer/restart` on the flow-control server (`scripts/lib/flow-control.mjs`), with tests (`scripts/ci/tests/flow-control.test.mjs`, 12 pass). Both are behind the same guard (no browser calls, custom header, own Host). The issuer restart uses `docker compose restart mock-oidc`; no endpoint was added to the issuer or any service.

## Found while doing it

The issuer signs with a key made at start-up (`MockOidcIssuer.cs`, a static `RSA.Create`), so after the restart in flow 13 the services may reject new tokens until they fetch the new key (expected, not tested: no flow runs after 13). Not a defect for a mock issuer; it is why the flow runs last.
