# Cross-browser run and fixes of the mock-backed browser suites, 2026-11-06

> **Status:** Current · register item 132. Current result: the second full `BROWSERS=all` run found 663 of 665 (customer app) and 296 of 300 (queue display); all 6 failures were then fixed and re-verified one by one, not by a second full run. A clean full repeat is a scheduled checkpoint (below). Not a real-stack run: both apps talk to their mock BFF and a fake issuer.

**Commits:** the full run was made on `f5653c1` plus the test changes of `c346862` as first written; the final test changes are `c346862` and the rate-limit change that follows it. **Machine:** the same Windows 11 development machine as `mock-backed-2026-11-02.md`. **Browsers:** Playwright's Chromium, Firefox and WebKit (not Safari), and the Pixel 7 and iPhone 14 profiles. No retries. The diagnosis of the 2026-11-02 failures is in `diagnosis-2026-11-06.md`.

## The full run (after fixes 1 to 3 of the diagnosis, before the last two adjustments)

| App | Tests x projects | Passed | Failed | Time |
|---|---|---|---|---|
| `apps/web-customer` | 133 x 5 = 665 | 663 | 2 | 14.4 min |
| `apps/web-queue-display` | 60 x 5 = 300 | 296 | 4 | 7.8 min |

The suites have grown since 2 November (320 and 160 executions then). All 13 failures of that run were gone except the cookie test, and two things were found:

| Failure | Cause | What was done |
|---|---|---|
| The cookie test in WebKit and the iPhone profile (customer app, and the queue display's twin: 4 executions) | My first fix read the raw `Set-Cookie` header of the login callback. WebKit hides that header on a redirect (shown by a probe: the redirect's headers had no `set-cookie`, Chromium's had two) | The raw header is asserted in every browser except WebKit, where nothing can be read; `packages/web-session` asserts the attribute in its own tests. The assertion fails when the server sends `SameSite=Strict` (checked, then reverted) |
| Two rate-limit tests in `mobile-chrome` (queue display) | New finding: the tests use fixed fake addresses on one shared server whose limits last a minute, so a project that starts soon after another finds the allowance used. Run alone with `BROWSERS=all`, 9 of 20 failed, and only the first project passed all four. The first full run and the 2 November run passed only because time happened to pass between projects | Each project now has its own block of addresses (`ip()` in `rate-limit.spec.ts`). The spec passes 20 of 20 in the five projects |

## Verification after the fixes

| What | Result |
|---|---|
| Cookie test and console-warning test, customer app, five projects | 10 of 10 passed |
| Cookie test, queue display, five projects | 5 of 5 passed |
| Rate-limit spec, queue display, `BROWSERS=all` | 20 of 20 passed |
| Default (Chromium only) suites, the pipeline's | customer app 133 of 133, queue display 60 of 60 (run before the rate-limit change; that spec passed in Chromium in the 20) |

## What this does not show

A clean full `BROWSERS=all` run of both apps after the last change (not made, by the lead's decision: the work still coming that touches these suites is register 137 and the payment-token item of 150, so one run will cover all of it); the real stack in any non-Chromium browser; real devices; iOS Safari itself; whether the pipeline should run Firefox and WebKit (still open, `verification-policy.md` section 4).

## Next

The clean full repeat of `BROWSERS=all` is a checkpoint after items 137 and 150 are built (register 132).
