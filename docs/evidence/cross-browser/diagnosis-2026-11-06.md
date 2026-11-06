# Diagnosis of the 13 Firefox and WebKit failures, 2026-11-06

> **Status:** Current · register item 132. Current result: of the 5 distinct failures in `mock-backed-2026-11-02.md` (13 executions), 4 are test flaws and 1 is a difference in how Playwright's WebKit reports cookies. None is an app defect. Nothing was fixed: every experiment below was made in a temporary copy of a test and reverted, so the repository's tests are unchanged. Classification only, as the lead decided on 2026-11-06.

**Commit:** `f5653c1` (the branch `feature/mobile-session-tests`; the pages and tests involved are unchanged in behaviour since the 2026-11-02 run). **Machine:** the same Windows 11 development machine. **Browsers:** Playwright's Chromium, Firefox and WebKit (not Safari). **How:** the failing customer-app tests were run again on their failing browsers (`BROWSERS=firefox,webkit npx playwright test <file>:<line>`); each cause was then checked with a probe or a temporary one-line change. The queue display was not re-run: its two failures are the same assertion as failure 2 below.

## Re-run

| Browser | Result of the five tests |
|---|---|
| Firefox | All 7 selected tests passed once; the console-warning test then failed in 8 of 10 repeats (failure 1) |
| WebKit | The same 5 failures as on 2026-11-02 (failures 2 to 5) |

## The five failures

| # | Test | Class | Cause | Evidence |
|---|---|---|---|---|
| 1 | "choosing and adding produces no console warnings or errors" (Firefox) | **Test flaw, with a Firefox reporting difference** | The test reloads the page right after "Add to order", while the page is still loading script chunks. Firefox logs "Loading failed for the `<script>`" when a reload cancels a load in flight; Chromium does not. The chunk exists in the build, so it is not a missing file. | A probe with the same steps: the warning appeared in 8 of 10 runs, always just before the reload's navigation. With `waitForLoadState('networkidle')` before the reload: 0 of 10. |
| 2 | "the browser holds no token: only an HttpOnly cookie…" (customer and queue display; WebKit and iPhone profiles) | **Reporting difference** | Playwright's WebKit reports `sameSite` as `None` for every cookie. The server sends `SameSite=Lax` and WebKit receives it. | A probe server set four cookies (Lax, Strict, None, unset) and read them back: the raw `Set-Cookie` headers were correct in all three browsers; `context.cookies()` gave Lax, Strict and (unset) `Lax/Strict/Lax` in Chromium, `Lax/Strict/None` in Firefox (both drop the `SameSite=None` cookie, which needs `Secure`), and `None` for all four in WebKit. |
| 3 | "a sold-out item says so…" and "the detail page shows the per-order limit…" (`stock.spec.ts`; WebKit and iPhone) | **Test flaw** | The test treats a URL change as "the detail page is ready". WebKit changes the URL before the page content, so the list is still in the page and the `stock` locator matches three elements; a strict-mode violation in `expect` fails at once, with no retry. | With a wait for the detail page's heading after the URL check, both tests passed in WebKit and in Chromium. |
| 4 | "refreshing asks the server again…" (`orders.spec.ts`; WebKit and iPhone) | **Test flaw** | `placeOrder` returns when the URL matches `/orders/…`. The order page's own first status query is still in flight, so the request listener counts it with the one from the click: two requests, not one. | With a wait for the status to show before the listener is attached: passed in WebKit and Chromium. |
| 5 | "when the order cannot be loaded…" (`orders.spec.ts`; WebKit and iPhone) | **Test flaw** | Same cause as 4: the test stubs `/api/graphql` with a 500 while the page's first query is still in flight, so that first load fails and the page shows "Try again" with no "Refresh status" button to click. | With the same wait before the stub: passed in WebKit and Chromium. |

Failures 3 to 5 share one cause: the URL changes earlier in WebKit than the content and the first data load. That is how a client-side navigation can behave and not a defect of the app (the app shows the right content once the page settles).

## What this does not show

The real stack in any non-Chromium browser; the iPhone profile separately (it uses the same WebKit engine, so its failures are taken to be the same); the queue display re-run; whether a real Safari behaves like Playwright's WebKit build; a full `BROWSERS=all` run after any fix. A one-off Firefox pass of the warning test (7 of 7 on the first re-run) shows the warning is timing-dependent, which is why it was first seen as intermittent.

## Possible fixes (none made; the lead decides)

1. Failure 1: wait for the page to be idle before the reload, or accept that Firefox logs a cancelled load as a warning and ignore that message for the reload step only.
2. Failure 2: assert the attribute on the raw `Set-Cookie` header of the callback response in every browser (it tests what the server sent, which is the point), or skip the `sameSite` line in WebKit with the reason.
3. Failures 3 to 5: wait for the destination page's content (a heading, the order status) instead of, or as well as, the URL, in `stock.spec.ts` and in `placeOrder`.
4. Then repeat `BROWSERS=all` for both apps, and decide whether the pipeline should run Firefox and WebKit (`verification-policy.md` section 4).
