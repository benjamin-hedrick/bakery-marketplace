# WI-QUE-004 on the real local stack: the vendor's actions from the queue display

> **Status:** Done for the local stack · run by the AI agent on 2026-11-02 on a developer machine (Windows 11, Docker Desktop with Compose, .NET 10, Node 25.9.0). The commands and the code under test are in commit `9cf35c1`, except the first run below, which was made on the working tree on top of `f9fb55b` before the fix.

**Command:** `node scripts/ci/skeleton-smoke.mjs` (from the repository root). **Starting state:** nothing running; the script brings up Redis (events), the Cosmos emulator, the mock issuer and the cache Redis in Compose, then the catalog, ordering, BFF and both web apps as host processes, seeds the data, runs the Playwright journeys, and tears everything down. The stack is shared by all journeys in the run; the new tests add the stock they use.

## What was run

Two new journeys (`apps/web-customer/tests/skeleton/vendor-actions.spec.ts`):

1. **The whole line from the buttons.** A vendor logs in to the queue display through the mock issuer (Corner Bakery, owner). A customer places an order with an option, so it waits for the vendor. The vendor clicks **Accept**, **Start preparing**, **Mark ready** and **Handed over**; after each click the customer's own `order` query is read through the BFF and shows `CONFIRMED`, `IN_PREPARATION`, `READY_FOR_FULFILLMENT` and `COMPLETED`, and the card moves from New to Preparing to Ready and off the screen. A second order is **declined** (the question is asked, then confirmed) and the customer sees `CANCELLED`.
2. **The real services refuse the wrong caller.** With a placed order and the vendor's read model holding it: the other vendor (`vendor-indep-001`) gets `NOT_FOUND` and the order stays `PLACED`; a customer token gets `FORBIDDEN` and the order stays `PLACED`; the owner's `CONFIRM` is done; the same `CONFIRM` again is `NOT_ALLOWED_NOW` with the current status `CONFIRMED`; a call with no token is `UNAUTHENTICATED` and the order stays `CONFIRMED`.

Raw output of the final run:

```
  ✓  17 tests\skeleton\vendor-actions.spec.ts:64:5 › the vendor accepts, starts, readies and hands over an order from the buttons, and the customer sees each step; a decline cancels (2.1s)
  ✓  18 tests\skeleton\vendor-actions.spec.ts:103:5 › the real services refuse the wrong caller: another vendor gets not found, a customer is forbidden, a repeated action is not allowed now (365ms)
  27 passed (29.7s)
[skeleton] Playwright exit code 0
```

The 27 are the 25 earlier journeys and these two.

## What the first run found

The first run (on the working tree on top of `f9fb55b`) **failed** the first journey: after **Accept**, the card went to Preparing and then back to New with its buttons enabled, and stayed there. The cause: the first version of the action asked the board for the list after a success; the list was read from ordering's vendor read model before it had caught up (still Placed) and replaced the newer card that the stream had already pushed. Nothing pushed again, so it stayed. The mock-backed tests could not show this, because the mock's list and stream are always in step. The fix in this item: a success no longer fetches the list. The cause in the board (a fetched list replaces what the screen holds whatever its sequence) is register item 133 and is not fixed here; changing it changes `WI-QUE-003`'s logic and needs the lead's decision.

## Other tests, after the change

| Suite | Result |
|---|---|
| BFF (`services/graphql-bff`, `npm test`) | 124 passed (107 before, 17 new) |
| Queue display unit (`npm run test:unit`) | 26 passed (22 before, 4 new) |
| Queue display browser, Chromium, mock BFF (`npm run test:e2e`) | 44 passed (32 before, 12 new; one old test, "display only", replaced) |
| The 12 new browser tests, Firefox and WebKit (`--browser=firefox`, `--browser=webkit`) | 12 passed in each |
| `node scripts/ci/node-gates.mjs --tests` | all 19 steps passed |

Tests shown to fail with the behavior removed: in the BFF, the 403 to FORBIDDEN mapping, the strict decoding of the order id and the encoding of the id in the path each made a test fail; in the browser, removing `disabled` from the buttons failed the in-flight test and removing the decline question failed the decline test. The CSRF refusal belongs to the shared session package and was not mutated (that package needs the lead's approval to change); a test on the mutation shows a foreign or missing origin is refused with nothing reaching the BFF, and the main journey shows the same-origin request is not.

## What this does not show

- The .NET services were not changed, so the .NET tests were not re-run for this item.
- No real identity provider: the issuer is the local mock. No Azure, API Management or Container Apps ingress.
- No load or rate test: the rate of actions per caller is register item 128.
- Containers mode (`skeleton-smoke.mjs --containers`) was not run; the queue display image is unchanged except for its code.
- A vendor cancel after confirmation, the customer's pickup confirmation, and the read-model race above (item 133).
- An independent review: the abuse cases were written and tested by the AI agent that built the item; the lead's review is the other check.
