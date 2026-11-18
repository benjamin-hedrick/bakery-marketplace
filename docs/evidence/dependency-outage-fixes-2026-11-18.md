# Dependency outage fixes, run again (2026-11-18)

> **Status:** Snapshot · 2026-11-18, `feature/hardening-followups` after `e9da26b` with the changes for registers 204, 205 and 206 (step 1) uncommitted at the time of the run; local stack, nothing deployed. **Current result:** the three outage runs of [`dependency-outages-2026-11-18.md`](dependency-outages-2026-11-18.md) were repeated against the fixes. **Issuer restarted (204):** fresh tokens were accepted by every service within 3 s of a restart, twice, and a browser sign-in right after a restart placed an order. **Cache Redis down (205):** no stall (slowest read in the first seconds 59 ms, was 5.2 s), no checkout refused, and the outage logged 6 warnings and 7 breaker lines (was 8,164 warnings). **Cosmos down (206 step 1):** the catalog's failed reads answer 503 (were 500); every failure still takes about 13 s, and a probe showed that no Cosmos client setting shortens it (step 2, for the lead).

## Environment

As in the first record: the throwaway runner (the stack of `scripts/lib/local-stack.mjs`, the catalog on the Redis cache, the customer web app), the token probe, the Playwright script and the paced load driver (four readers, a round every 200 ms, BFF reads and an order every 2 s kept under the BFF's limit). A fresh stack: `scripts/dev/init-env.mjs` (run by the stack) created `MOCK_OIDC_SIGNING_KEY` in `.env` and kept the other two values; the issuer image was rebuilt and logged `Mock issuer signs with the configured key (MockOidc:SigningKey); it is the same after a restart.`

## 204: the issuer restarted

| Time (UTC) | Step | Observed |
|---|---|---|
| 17:51:42 | A token saved; the saved token and a fresh one against ordering, the catalog and the BFF, three rounds (the services now hold the issuer's key) | All 200 / ok |
| 17:51:47 | `docker compose restart mock-oidc` | |
| 17:51:50 to 17:51:52 | The same three rounds | The token from before the restart and a fresh one: 200 / ok everywhere, from the first round |
| 17:51:54 | A new customer signs in through the web app, then places an order | Signed in; "Order confirmed" |
| 17:51:59 | `docker compose restart mock-oidc` again (the case that failed for 4 minutes before) | |
| 17:52:02 to 17:52:04 | The same three rounds | All 200 / ok |

## 205: the cache Redis stopped for 60 s under load

| t (s) | Time (UTC) | Phase | Observed (per 5 s) |
|---|---|---|---|
| 0 to 30 | 17:52:14 | before | about 100 catalog page and 100 listing reads (median 3 to 5 ms), 12 BFF reads, 2 to 3 orders (about 50 ms); no failure |
| 30 | 17:52:44 | `docker compose stop redis-cache` | |
| 31 to 35 | | down | 100 page reads (slowest 59 ms), 100 listing reads, 12 BFF reads, 3 orders confirmed (slowest 59 ms) |
| 36 to 90 | | down | median 0 to 1 ms (the in-process fallback); no failure; every order confirmed |
| 90 | 17:53:44 | `docker compose start redis-cache` | |
| 91 to 150 | | after | no failure, no request over 100 ms |

The catalog log for the whole outage: `Circuit breaker opened for 30 s after a primary failure; calls use the fallback until it closes` and 4 warnings `Cache primary failure ... Falling back to local cache` from the calls that were already under way; then twice `Circuit breaker half-open: the next call tries the primary`, the probe's failure (one warning) and `opened` again; after the restart `half-open` and `Circuit breaker closed: the primary answered again`. 6 warnings and 7 breaker lines in all, and the log grew 4.9 MB over the whole run, request logging included. The cache Redis was in use again afterwards (3,666 hits). The counter `cache_fallback` was not read on the live process (no collector); the unit test `CacheOutageLoggingTests` checks it.

## 206: Cosmos stopped for 60 s under load

| t (s) | Time (UTC) | Phase | Observed |
|---|---|---|---|
| 30 | 17:55:32 | `docker compose stop cosmos` | |
| 31 to 90 | | down | reads served from the listing cache until it expired; orders refused `TEMPORARILY_UNAVAILABLE` after 13.1 to 13.2 s each (four) |
| 90 | 17:56:32 | `docker compose start cosmos` | the four page reads waiting at that moment answered **503** after 13.2 s (were 500) |
| 91 to 180 | | after | normal after the first seconds (slowest 6.1 s read and 7.2 s order right after the restart); no failure |

The catalog log shows 4 `the store could not be reached; answered 503` warnings and no unhandled exception. This run had no generic `INTERNAL` checkout error; that error came from timing (a 13 s failure close to the BFF's 15 s limit), which step 2 is for.

### Step 2: what makes a failure take 13 s (a probe, not a fix)

A throwaway console program with the repository's client settings (`Microsoft.Azure.Cosmos` 3.63.2, gateway mode, `LimitToEndpoint`) made three clients, the default and two with `RequestTimeout` of 2 s and 1 s, read once each while only the emulator ran, then stopped the emulator (17:40:16) and read three times with each:

| Client | Read 1 | Read 2 | Read 3 |
|---|---|---|---|
| default | `HttpRequestException` after 37.6 s | 37.6 s | 37.8 s |
| `RequestTimeout` 2 s | 37.6 s | 37.6 s | 37.5 s |
| `RequestTimeout` 1 s | 37.7 s | 37.7 s | 324.4 s |

So `RequestTimeout` does not bound a refused connection (the SDK retries it on its own schedule), and the time a failure takes is long and not stable: 13 s inside the services under load, about 38 s from a single client, once over 5 minutes. No client option tried shortens it. What would: a time limit on each call in the repository adapter (a cancellation after a configured time, turned into `StoreUnavailableException`). For a read that is safe. For a write, the call may still be applied after the limit, so its outcome is unknown; `StoreUnavailableException` already says that, and checkout's idempotency key makes its retry safe, but a stock reservation or a vendor's edit would need checking. That choice is the lead's (register 206).

## Teardown

The runner stopped the host processes and `docker compose --profile with-redis down` removed the containers and their data. Logs in `artifacts/run166/` (git-ignored).
