# Dependency outages: the issuer, Cosmos and the cache Redis (2026-11-18)

> **Status:** Snapshot · 2026-11-18, `feature/hardening-followups` at `52251ea` plus the register 203 change (uncommitted at the time of the run); local stack, nothing deployed. Register item 166. **Current result:** each of the three was stopped while customers were using the stack, and started again. All three recovered by themselves with no restart of any service and no data lost. **Issuer down:** customers already signed in kept browsing and ordering; a new sign-in ended on the browser's own "site can't be reached" page. **Issuer restarted:** new sign-ins were refused by the services for up to about 5 minutes (register 204). **Cache Redis down:** browsing kept working from the fallback; the first seconds stalled reads for about 5 s, long enough for one checkout to be refused as temporarily unavailable; the fallback logged one warning per cache call (register 205). **Cosmos down:** browsing kept working while cached entries lasted (about a minute); order history and checkout said plainly they could not load; orders and, later, reads failed slowly (13 to 15 s), the catalog's reads with a 500 rather than a 503, and one checkout with a generic error (register 206).

## Environment

Windows 11, Docker Desktop, a quiet machine (the lead's word). The stack of `scripts/lib/local-stack.mjs`, started by a throwaway runner kept outside the repository: the same calls as `scripts/dev/demo.mjs` (Compose infrastructure with the `with-redis` profile, the seed, catalog, ordering, the BFF and the customer web app from source, `Development` settings), except that the catalog used the Redis cache (`Cache__Backend=redis` on the cache Redis, port 6380, as `scripts/ci/chaos-smoke.mjs` starts it for the cache scenarios); no vendor screen, no chaos scenario. Logs were in `artifacts/run166/` (git-ignored; the catalog log reached 2.3 GB and was deleted after the counts below were taken). The register 203 runbook test ran on the same stack at the same time ([`runbook-parked-listing-outbox-2026-11-18.md`](runbook-parked-listing-outbox-2026-11-18.md)); it touched one listing's outbox, which nothing below reads.

Three throwaway tools, kept outside the repository: a Playwright script (the web app's installed Playwright and Chromium) that does what a customer does on the pages (log in as Alice, open the order history, put one Country Sourdough in the order and place it, open the home page) and saves the session so a later step reuses it; a token probe that gets a token from the mock issuer as `scripts/lib/issuer-token.mjs` does and calls ordering, the catalog and the BFF with it; and a load driver that runs four readers (each round: the catalog's listing page and one listing straight from the service, and for one reader every other round the BFF's `listings` query; a round every 200 ms) and an order every 2 s through the BFF as Alice (one Country Sourdough, no option, so it confirms by itself), stops the named Compose container part way, starts it again, and prints per 5 s how many requests of each kind ran, how many failed and how, and the median and slowest time. Stock for the orders was added through the vendor's own stock endpoint.

## 1. The mock issuer

### Stopped while customers use the site

| Time (UTC) | Step | Observed |
|---|---|---|
| 16:42:30 | Issuer up. Alice signs in through the web app (`/orders` → Log in → the issuer's page → back) | Signed in; history empty |
| 16:42:35 | Alice places an order through the page | "Order confirmed" in 0.7 s |
| 16:42:43 | `docker compose stop mock-oidc` (stopped 16:42:44) | |
| 16:42:44 | Alice (signed in before) opens her history, places another order, opens the history again | History in 0.16 s; "Order confirmed" in 0.55 s; 2 orders listed |
| 16:42:46 | A visitor opens the home page | 9 listings in 0.14 s |
| 16:42:47 | A new customer presses Log in | The web app answers its usual 302 to the issuer's authorize page; the browser shows its own connection error (`chrome-error://chromewebdata/`): the app itself says nothing |
| 16:43:03 | `docker compose start mock-oidc` (up 16:43:06) | |

So while the issuer is down, a customer already signed in is not affected: the web app's server holds the session and its access token, the services validate the token with the signing key they fetched before, and ordering already holds its own service token for the catalog. Only a new sign-in fails, and it fails on the issuer's page, not in the app.

Not run: an outage longer than an access token's life (an hour with the mock issuer), when the web app would need the issuer to renew the session; a service starting while the issuer is down (it fetches the issuer's metadata on its first request); ordering needing a new service token during the outage.

### Started again: new sign-ins refused for up to 5 minutes

| Time (UTC) | Step | Observed |
|---|---|---|
| 16:43:06 | A new customer signs in | The issuer's page and the callback work, but the app comes back to "Please log in to continue": ordering answered the BFF's call with the new token `401` |
| 16:43:31 | Alice (signed in before the restart) opens her history and places an order | Both work |
| 16:43:59 | A fresh token straight to the services | Ordering 200; the catalog `401` with `Bearer error="invalid_token", error_description="The signature is invalid"` |
| 16:44:11 | The same again; then the new customer signs in again | Ordering 200, catalog 200, BFF ok; the sign-in works and lists the orders |
| 16:44:47 | A token saved, then `docker compose restart mock-oidc` (16:44:51) | |
| 16:44:54 to 16:48:26 | Every 30 s: the saved (older) token and a fresh one against ordering, the catalog and the BFF | The older token: 200 everywhere, throughout. The fresh one: `401` from ordering and the catalog and `UNAUTHENTICATED` from the BFF, every time |
| 16:48:58 | The same | Fresh token: ordering 200, catalog still 401 |
| 16:49:31 and later | The same | Fresh token accepted everywhere; the older one still accepted |

Why: the mock issuer makes a new RSA key each time it starts and always calls it `mock-key-1` (read in `tools/BakeryMarketplace.Auth/MockOidcIssuer.cs`). A service that already holds the old key under that id finds the key, the signature does not match, and the token is refused. A failed token makes the JWT handler ask for the issuer's metadata again; the timings fit the IdentityModel configuration manager honouring such a request at most once every 5 minutes (its `RefreshInterval` default) except the first, which is why the first restart cleared in under a minute and the second took about 4 minutes. That library behaviour is our reading of its documented defaults, not checked in its source. The tokens signed before the restart kept passing after the services had the new key; why was not examined. Real Entra ID publishes several keys with distinct ids and rotates them with an overlap, so this is a property of the mock issuer; but it is the issuer every local run and the Android flows use. Register 204.

## 2. The cache Redis

The first attempt (16:51:03) ran the four readers with no pacing, about 650 requests a second each kind: the BFF's per-source limit (600 a minute) refused almost every BFF call and every order with 429, so only the catalog half of it counts. In that run, through 60 s with the cache Redis stopped, the catalog served 3,500 to 4,250 reads of each kind every 5 s with none failing (one page read took 5.5 s), and logged 300,915 warnings `Cache primary failure on GetAsync ... Falling back to local cache`, each with a stack trace (277,740 of them a `BrokenCircuitException` with the breaker open, 23,170 the same exception reported as not open, 5 the Redis connection errors themselves). The run was repeated paced:

| t (s) | Time (UTC) | Phase | Observed (per 5 s) |
|---|---|---|---|
| 0 to 30 | 16:55:47 | before | about 100 catalog page and 100 listing reads (median 3 to 5 ms, slowest 30 ms), 12 BFF reads (5 ms), 2 to 3 orders (about 50 ms; one took 2.1 s) |
| 30 | 16:56:17 | `docker compose stop redis-cache` (stopped 0.6 s later) | |
| 31 to 35 | | down | only 4 reads and 1 order completed: every reader waited about 5 s |
| 36 to 40 | | down | the slowest catalog page 5.2 s; one order took 5.0 s and was refused `PlaceOrderRejected TEMPORARILY_UNAVAILABLE`: ordering's call to the catalog timed out at 5 s (`Catalog call failed before an answer (catalog-public GET): TaskCanceledException`, checkout 503 after 5,033 ms) |
| 41 to 90 | | down | normal again (median 1 to 3 ms) apart from one 6.0 s page read at t 71 to 75, about 35 s after the breaker opened (the break lasts 30 s) (when the breaker lets one call try Redis); no failure |
| 90 | 16:57:17 | `docker compose start redis-cache` | |
| 91 to 150 | | after | normal; no failure; no fallback warning |

The paced run's outage added 8,164 warnings and about 42 MB to the catalog log. After the restart the cache Redis, which came back empty (it keeps nothing on disk), was in use again: 6,069 hits shortly after the paced run, 330,222 after the first.

So the fallback does what ADR-0002 says (a read never fails because the cache did), the breaker opens within seconds and the service goes back to Redis by itself. Two costs that the design did not state: the first seconds of an outage hold every read for the Redis client's timeout (about 5 s), and each half-open probe holds one read as long, which is as long as ordering waits for the catalog, so checkouts in that moment are refused; and the fallback writes a warning with a stack trace for every cache call while Redis is down. Register 205.

Not run: more than one catalog instance (each falls back to its own memory, `patterns.md` section 14); an outage of the sessions Redis (the web app's `session-outage` chaos scenario covers the web side).

## 3. Cosmos (the vNext emulator)

| t (s) | Time (UTC) | Phase | Observed (per 5 s) |
|---|---|---|---|
| 0 to 30 | 16:58:55 | before | as above; no failure |
| 30 | 16:59:25 | `docker compose stop cosmos` (stopped 0.9 s later) | |
| 31 to 60 | | down | catalog reads and BFF reads normal (served from the listing cache); one order sent in the first seconds succeeded; the next took 13.2 s and was refused `TEMPORARILY_UNAVAILABLE` |
| 61 to 90 | | down | one order 15.0 s and a generic `INTERNAL` error (the BFF's 15 s checkout limit: `ordering request failed: TimeoutError`); one 13.7 s `TEMPORARILY_UNAVAILABLE`; catalog reads, once the cached entries had expired, each failed with HTTP 500 after 13.2 s (`StoreUnavailableException: The store could not be reached`, unhandled in the catalog); the readers spent the rest of the window waiting |
| 90 | 17:00:25 | `docker compose start cosmos` (0.6 s) | |
| 91 to 95 | | after | the requests waiting at the restart failed (500 after 13.6 s; one order refused after 13.2 s); the first new ones took up to 6.1 s |
| 96 to 210 | | after | normal; no failure; every order confirmed |

What the web customer saw during the outage (16:59:27 to 17:00:04): the home page listed all 9 listings (cached); the order history said "We could not load your orders. Nothing has changed." with Try again, after 5.5 s; the checkout page showed the order with "Payment methods could not be loaded." and Try again, "We could not check this order against your allergies. You can still place it; please check the allergens listed above with the bakery.", and the Place test order button stayed unavailable (no payment method to choose). Both outbox relays logged their failed sweeps and carried on. The emulator kept its data across the stop and start (orders and listings read back afterwards).

So no customer was told something false and no data was lost, and the stack recovered within seconds. Three things are worse than they need to be: every failing request waits about 13 s (the SDK's retries on a refused connection) before the service gives up, longer than ordering's 5 s wait for the catalog and close to the BFF's 15 s checkout limit, so one checkout ended in a generic error instead of "temporarily unavailable"; and the catalog answers an unreachable store with 500 where ordering answers 503 (`CheckoutService` maps `StoreUnavailableException`; the catalog's endpoints do not). Register 206.

Not run: a real Cosmos account (direct mode, regional failover and throttling behave differently from the emulator in gateway mode); the vendor screens during the outage; the home page after the cached entries expired (only the service's answer was measured).

## Teardown

The runner stopped the host processes and `docker compose --profile with-redis down` removed the containers and their data. The run's logs in `artifacts/run166/` other than the catalog's are kept locally (git-ignored).
