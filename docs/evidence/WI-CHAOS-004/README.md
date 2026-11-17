# The session store under a chaos scenario (WI-CHAOS-004, ADR-0024)

> **Status:** Current · two runs on the real local stack (Docker infrastructure, the .NET services, the BFF and both web servers as processes), by `node scripts/ci/chaos-smoke.mjs session-outage`: the first on 2026-11-16 with the WI-CHAOS-004 changes, the second on 2026-11-17 after register 195 was fixed (the summary is the second run's). Windows 11, Docker Desktop. Local only; nothing is deployed.

The summary is the run's `summary.json` copied from `artifacts/chaos/session-outage/`: [`summary-session-outage.json`](summary-session-outage.json). How to read it is in the [WI-CHAOS-003 record](../WI-CHAOS-003/README.md). Since this item the web servers log their journal as the BFF does, so `faultsInjectedByTheServices` counts their faults too.

## The scenario

[`chaos/scenarios/session-outage.json`](../../../chaos/scenarios/session-outage.json): the `session` layer at `failureRate` 1, switched off at the start. Two signals, matched on the session store's own calls: a login whose return page is `/chaos/session-outage/on` switches the layer on, one returning to `/chaos/session-outage/off` switches it off. The rules are in the scenario file; the application has nothing for them. While the layer is on, every call to the session store fails as an unreachable store does (registers 192 and 194).

## What the run showed

| Check | Result |
|---|---|
| The spec ([`session-outage.spec.ts`](../../../apps/web-customer/tests/chaos/session-outage.spec.ts)) | 1 of 1 passed |
| The signalling login that switched the outage on | refused: 302 to `/auth/error?code=unavailable` (the layer was on for the call that switched it on) |
| A second visitor's login during the outage | the error page, "Login is not available just now. Please try again in a moment." |
| Alice, logged in before the outage, reopening her order history during it | first run: the page asked her to log in (`me` answered 503, which the page then took as nobody logged in: register 195). Second run, after the fix: "Login is not available just now. Please try again in a moment." with Try again, and no login button; not blank, not stuck |
| The signalling login that switched the outage off | 302 to the issuer (judged after the signal) |
| Alice's session from before the outage, afterwards | kept: in the second run she pressed Try again and her history loaded without a new login |
| A new login after the outage | succeeded 0.23 s (first run) and 0.27 s (second run) after the outage ended |
| Faults in the web server's journal | `signal:enable` 1, `session:failure` 3, `signal:disable` 1; the run requires at least one of each of the first two |
| Problems reported by the run | none |

The web server's journal lines carry a hash of the session or pending-login id as the key, never the id (`artifacts/chaos/session-outage/web.log`, not committed): for example `{"msg":"chaos injected","layer":"session","fault":"failure","key":"get:248de74359e751f7:1"}`.

## Not covered

- The queue display runs the same package and was started with the scenario, but the spec drives only the customer app.
- An outage during a token renewal (the renewal takes a lock in the store) is covered by the package's tests, not by this run.
- Found by the first run and fixed before the second: a logged-in customer was asked to log in during the outage (register 195).
