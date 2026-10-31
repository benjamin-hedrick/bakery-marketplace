# Playwright guide (customer web app)

> **Status:** Current · written 2026-10-30 from `apps/web-customer/tests`, the two Playwright configs and `docs/evidence/test-reliability/findings.md` (`WI-QA-001`, row `T-31`). How the browser tests are laid out, the rules that keep them deterministic, and how to add one. Where they sit among the other tests: [`test-strategy.md`](test-strategy.md); what to check when reviewing one: [`test-review-checklist.md`](test-review-checklist.md).

## Two suites, two configs

| Suite | Folder and config | Backend | Count | Run |
|---|---|---|---|---|
| Mock-backed | `tests/e2e`, `playwright.config.ts` | A mock BFF on `:4000` (`mock-bff/`), fixtures in `mock-bff/fixtures.mjs` | 62 | `npm run test:e2e` (builds, starts the mock and `next start`, runs Chromium) |
| Real stack | `tests/skeleton`, `playwright.skeleton.config.ts` | The whole local stack: Compose, seed, catalog, ordering, BFF, the mock issuer | 21 | `node scripts/ci/skeleton-smoke.mjs` from the repository root, which starts and tears down everything |

Both use one worker, no retries and a production build (`next start`), because hydration warnings differ in `next dev` and a retry hides a flake. Run from `apps/web-customer`. Install the browser once with `npx playwright install chromium`.

## Selecting elements

Select by what a person sees, in this order: role and accessible name (`getByRole('button', { name: 'Place test order' })`), label (`getByLabel('Quantity')`), then `data-testid` where the page has no better handle (`listing`, `price`, `stock`, `cart-link`, `order-status`, `login-required`). Never by CSS class, DOM position or generated text. Styling changes (register item 97) did not touch a single test for this reason. If a test needs a new handle, add a `data-testid` to the component, not a class.

## Fixtures and the mock BFF

- The mock BFF picks its data from a request header: `x-fixture: A|B` selects the listing set; `x-delay-ms` slows a response; `x-test-payment: decline` is the declined-payment hook. Set them per browser context with `extraHTTPHeaders`, not globally.
- The Next.js server forwards `x-fixture` and `x-delay-ms` only when `ENABLE_TEST_HOOKS=1` (`forwardTestHeaders` in `src/lib/relay/environment.ts`), and the real BFF forwards the declined-payment hook only under the same variable. **The variable must never be set outside tests.** `playwright.config.ts` sets it for the web server it starts; `skeleton-smoke.mjs` sets it for the BFF it starts; `scripts/dev/demo.mjs` does not set it.
- `tests/e2e/helpers.ts` gives a logged-in customer without the real issuer: `stubIssuer` stubs `/authorize` and `/token` inside the browser with `page.route`, so the whole PKCE flow runs for real in the page and the token is a fake with the right claims (`fakeToken`).
- `tests/skeleton/support.ts` gives a real token from the mock issuer without a browser (`userToken`, the same Authorization Code and PKCE exchange), stable global ids (`globalId`), and the vendor's view of stock (`quantity`, `adjustStock`) for checking that an order really took stock.

## Determinism rules

These come from the ten failures in `docs/evidence/test-reliability/findings.md`.

1. **No fixed sleeps.** Wait for a condition: `await expect(locator).toHaveText(...)`, `toHaveURL`, `waitFor`. Assertions retry; `page.waitForTimeout` does not belong in a test.
2. **Wait for navigation before reading the page.** Read `toHaveURL` first, then the new page's content (two login tests read the URL before the router finished).
3. **Assume no time zone, locale or clock.** Never match a formatted time with a pattern that fits one zone (a journey test failed only on the UTC agent). Assert that a value exists and is ordered, not what it looks like.
4. **Unique data per test.** A new idempotency key per attempt (`randomUUID()`); state that other tests also touch (stock) is read before and after with a delta, not asserted as an absolute.
5. **Nothing shared between tests.** A new browser context per test that needs different headers or storage; clean up what the test created.
6. **No console errors.** The journey asserts the page produced no console warnings or errors; a hydration mismatch fails the test.
7. **A test must fail when the behaviour breaks.** Before trusting a new test, break the code it names by one line and see it fail (the mutation check; register item 85).
8. **No local state the clean agent lacks.** The Relay artifacts and the results folder are git-ignored; `npm run typecheck` and `npm run build` recreate the first. If a test passes only because of a leftover file, the Azure run will find it.

## Add a test

1. Decide the layer: a rendered behaviour of the web app alone goes in `tests/e2e` against the mock; a claim that spans services goes in `tests/skeleton`. A pure function goes in `tests/unit` (Node's test runner).
2. If the mock needs new data, add a fixture to `mock-bff/fixtures.mjs` and select it by header.
3. Write the test with the selectors and rules above. Name it as the behaviour (`a sold-out item cannot be ordered`), not the function.
4. Run it alone, then the suite, then ten times (`for i in $(seq 10); do npx playwright test tests/e2e/<file>; done`); then once on Linux via the pipeline.
5. Break the code once to see it fail; restore it.
6. Run `node scripts/ci/node-gates.mjs` before committing (Prettier and ESLint cover the tests).

## Reading a failure

`trace: 'retain-on-failure'` keeps a trace under `test-results/`: `npx playwright show-trace test-results/<test>/trace.zip`. In the pipeline the traces of a failed `skeleton` job are published as the `skeleton-playwright-traces` artifact.

## Accessibility scans

`tests/e2e/accessibility.spec.ts` runs axe-core (`@axe-core/playwright`, a dev dependency pinned to 4.14.0) with the WCAG 2.0 and 2.1 A and AA rules on the listings, listing, checkout and order pages, and the listings page again in the dark theme. A failure names the rule and the first element. The first run found two real defects (no `lang` on the document, no `<title>` on two pages); both were fixed. A clean scan is a smoke result, not an assessment: add a scan for each new kind of page, and test keyboard use by hand.
