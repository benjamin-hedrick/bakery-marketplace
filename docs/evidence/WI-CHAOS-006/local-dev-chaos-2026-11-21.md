# dev-chaos on the local stack, 2026-11-21

> **Status:** Current · the first wave of `dev-chaos` (WI-CHAOS-006) run on the whole local stack, then the same suite with no scenario. Not yet run in the deployed dev environment (that needs the module variable and the pipeline input, step 5).

## How it was run

- `STACK_CHAOS_SCENARIO=dev-chaos node scripts/dev/demo.mjs --customer-only`: every process started with the scenario (the services, the BFF, the web app), on a fresh Cosmos emulator, seeded by the seed program with the new chaos data (16 listings, 3 vendors, 9 payment methods).
- The deployed suite (`apps/web-customer/playwright.deployed.config.ts`) against `http://localhost:3000` and the local issuer, with its warm-up, from the lead's machine.
- Then the stack again with no scenario (`demo.mjs --customer-only --stop-after 900`), the same suite.

## Results

| Run | Chaos tests (06b) | The rest of the suite | Notes |
|---|---|---|---|
| dev-chaos, chaos tests alone (first try) | 3 passed, 1 failed | not run | The failure was the test's selector: the lost-payment message is in an alert other than `checkout-error`. The system did what it should (below). Fixed in the test. |
| dev-chaos, chaos tests alone | 4 passed | not run | |
| dev-chaos, whole suite, 2 workers | 4 passed | 10 passed, 2 failed | The 2 failures are tests 3 and 4, which need an https issuer and the `__Host-` cookie and fail locally by design. The concurrency test (11) passed alongside the chaos tests. |
| no scenario, whole suite, 2 workers | 4 passed (the plain path) | 9 passed, 2 failed, 1 skipped | The same two by design; 11 skipped because the earlier run had sold the lemonade (it needs fresh seed data). |

What each chaos fault did, in dev-chaos (from the tests' assertions and the services' logs):

- **A lost payment answer** (Casey, the chaos card): ordering's log shows `chaos injected: layer=payment fault=lostResponse`, then "Checkout ... answered 'try again': the payment processor or the store could not be reached" (`PaymentUnavailableException: ... the authorization was made but the response was lost`). Checkout voided the authorization and released the stock (register 171's path). The customer saw "We could not place your order right now. Nothing has been charged, and your order is still here."; no order was created; the browser's answer named `ordering/payment:lostResponse`.
- **The stock check said no** (Remy, the chaos strudel): `chaos injected: layer=catalog fault=reject` in ordering's log; the customer saw the rejection notice and stayed on checkout; no order; the strudel still showed "In stock"; the browser's answer named `ordering/catalog:reject`.
- **The outage switched by two reads:** after a read of the Lights-Out Loaf, the Flickering Focaccia's page did not show the listing and did not answer "not found"; the sourdough stayed available meanwhile; after a read of the Lights-On Loaf the focaccia was back.
- **The slow door for one trace id:** the request carrying that trace id took over 2 seconds and named `bff:latency`; a request without it was quick and named nothing.

## What this shows and does not

- One scenario, aimed only at chaos seed data, ran under the whole regular suite in parallel without disturbing it, and the same chaos tests pass with and without a scenario.
- It does not show the deployed environment (the scenario switch, step 5, is not built yet), event-handler faults (none in the first wave), or the observe stage's journal check by trace id.
