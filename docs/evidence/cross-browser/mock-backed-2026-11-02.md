# Cross-browser run of the mock-backed browser suites, 2026-11-02

> **Status:** Current · first run of the cross-browser checkpoint (`docs/process/verification-policy.md` section 4, on the branch `feature/process-review`, proposed). Not a real-stack run: both apps talk to their mock BFF and a fake issuer.

**Commit:** `76f009b` (main) plus the `BROWSERS` setting in both `playwright.config.ts` files. **Machine:** Windows 11, one developer machine. **Starting state:** no servers running, Playwright started the mock BFF, the fake issuer and a production `next start`. **Playwright browsers:** Chromium (existing), Firefox and WebKit installed with `npx playwright install firefox webkit` (WebKit 27.2). Profiles: `Desktop Chrome`, `Desktop Firefox`, `Desktop Safari`, `Pixel 7` (Chromium engine), `iPhone 14` (WebKit engine). No retries.

**Commands**, from each app directory: `BROWSERS=all npx playwright test --reporter=line`. The default (no `BROWSERS`) is Chromium only, so the pipeline is unchanged.

| App | Tests x projects | Passed | Failed | Time |
|---|---|---|---|---|
| `apps/web-customer` | 64 x 5 = 320 | 309 | 11 | 7.8 min |
| `apps/web-queue-display` | 32 x 5 = 160 | 158 | 2 | 4.2 min |

Chromium, Firefox-except-one, and both Chromium-engine profiles (desktop and Pixel 7) passed everything except the one Firefox failure below. All other failures are in WebKit and repeat identically in the iPhone profile.

## Failures (11 in the customer app, 2 in the queue display)

| # | Test | Browsers | What was seen | State |
|---|---|---|---|---|
| 1 | "choosing and adding produces no console warnings or errors" (`order-controls.spec.ts:123`) | Firefox | Firefox logged `Loading failed for the <script>` for one Next.js chunk on a listing page. Seen in the full run and again in a rerun of this test alone, so not a one-off; other console-error tests passed in Firefox. | Not diagnosed. A cancelled prefetch or a real load failure is not yet told apart. |
| 2 | "the browser holds no token: only an HttpOnly cookie..." (customer `login.spec.ts:46`) and the same test in the queue display (`queue.spec.ts:207`) | WebKit, iPhone | Playwright reports the session cookie's `sameSite` as `None`; the test expects `Lax`. The server code sets `SameSite=Lax` (`packages/web-session/src/cookie.ts`, asserted in the package tests), and Chromium and Firefox report `Lax`. | Probably Playwright's WebKit reporting the attribute differently; not confirmed against the raw `Set-Cookie` header in WebKit. |
| 3 | "a sold-out item says so on the list and on its detail page" and "the detail page shows the per-order limit" (`stock.spec.ts:18`, `:30`) | WebKit, iPhone | After the click, the URL matches `/listings/` but `getByTestId('stock')` still resolves to three elements: the list is still in the page. | Not diagnosed. Either the test waits on the URL before the page has changed (a test flaw) or WebKit changes the URL earlier than the render. |
| 4 | "refreshing asks the server again..." (`orders.spec.ts:85`) | WebKit, iPhone | Two `OrderStatusQuery` requests after the click where one is expected. | Not diagnosed; may be an extra fetch in the app. |
| 5 | "when the order cannot be loaded..." (`orders.spec.ts:98`) | WebKit, iPhone | Clicking "Refresh status" timed out at 30 s. | Not diagnosed. |

## What this does not show

The real stack in any non-Chromium browser (`test:skeleton`); real devices; mobile layouts judged by a person (only the viewport and touch emulation changed); the queue display's live stream in Firefox or WebKit beyond what its mock-backed tests do; iOS Safari itself (the WebKit build Playwright ships is not Safari).

## Next

The failures are in the register (item 132). Nothing in the app was changed in this run.
