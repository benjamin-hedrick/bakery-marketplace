# dev-chaos in the deployed dev environment, build 117 (2026-11-22)

> **Status:** Current · `WI-CHAOS-006` step 7, the dev half: one dev pipeline run with `dev-chaos` switched on. The UAT half cannot run (register 235). Read from the build's step logs by the agent, with the lead's Azure DevOps sign-in; the pipeline artifacts could not be downloaded (TF400813), so the Playwright report and the per-test "fault injected" list are not read here.

## How it was run

- Dev pipeline build **117**, started by the lead on 2026-11-22 (UTC 2026-11-23 00:15 to 00:54) with `chaosScenario: dev-chaos`, on the environment already up from run 100, with the pipeline's `cacheRedis` input at its default (on): the `redis-cache` app is running and the catalog has `Cache__Backend=redis` (checked afterwards with `az containerapp show`). Run 100's in-place removal was therefore undone by this run, and build 117 says nothing about goal 3 of `WI-DEP-001`. All seven stages succeeded: inputs, images, plan, apply, application deploy, smoke, observe.
- The application deploy updated all five apps to new revisions (`web--b117-1`, `graphql-bff--b117-1`, `catalog--b117-1`, `ordering--b117-1`, `mock-oidc--b117-1`) and the pipeline reported "build 117 runs in all 5 apps". The seed job's image was still build 100's when the deploy step read it; whether the seed job ran on build 117 was not read from the log.
- The deployed customer suite then ran from the agent against the public addresses, with the warm-up first, then the latency script.

## The suite

16 tests, 1 worker: **15 passed, 1 skipped, 0 failed** (32.3 s). Exit codes 0 and 0.

- Tests 1 to 10 (browse, issuer, login, orders, allergens, console) passed as before.
- **The four chaos tests (06b) passed**: a lost payment answer (2.1 s), a stock check that says no (2.2 s), an outage switched by two reads (1.6 s), a slow BFF for one caller's trace (2.1 s). Each asserts an outcome that holds with or without chaos, so a pass shows the system handled the fault, and the observe counts below show the faults were in fact injected.
- **Skipped: test 11, five customers order the last units at once.** It skips itself when the lemonade shows "Sold out" (a long-lived environment: an earlier run sold it; the test needs freshly seeded stock). So the concurrency path was **not exercised** in this run. Build 88's record has a concurrency result on a fresh environment.

## The observe stage

Window 00:43:49 to 00:53:38 UTC.

| What | Result |
|---|---|
| Chaos on (scenario started) | `dev-chaos` in ordering, catalog, graphql-bff and web, 1 start each |
| Faults injected | ordering `payment:lost` x1; ordering `catalog:reject` x1; graphql-bff `bff:latency` x1 |
| Correlation ids | 40 of 40 smoke trace ids found in the console log |
| Replica restarts | 0 in every app |
| Replica start times | mock-oidc 18 s, ordering 20 s, graphql-bff 40 s, catalog 9 s, web 17 s (all new revisions from the deploy) |

Things to read with care:

- The chaos tests drove four faults (lost payment, rejected stock check, an outage, slow BFF) but the observe counts show three kinds. The outage fault (two reads switch a listing off and on) is not in the injected list. Whether the log query does not count it or the layer does not log it as "injected" is not known; local-dev-chaos-2026-11-21.md saw it work in behaviour only (the listing went and came back), and the test passed here too. Left open as a question, not resolved.
- Every injected count is 1, which matches one test per fault; they are not load figures.
- Request counts for web, BFF, catalog and ordering read 0 and CPU/memory show "-" for web and BFF. The suite clearly sent traffic, so these figures do not describe it; why they are 0 was not investigated here.

## Latency, from the agent

Build 117, `dev-chaos` on, 5 apps warm (the warm-up reported no cold start; total 1296 ms).

| Request | n | Failed | 429 | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| first: home page (one request) | 1 | 0 | 0 | 117.5 | 117.5 | 117.5 |
| read: home page (server-rendered) | 30 | 0 | 0 | 36.4 | 43.3 | 45.7 |
| read: listing page (server-rendered) | 30 | 0 | 0 | 33.8 | 69.2 | 80.1 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 0 | 30.8 | 58.4 | 81.4 |
| checkout: first order of the run | 1 | 0 | 0 | 155.6 | 155.6 | 155.6 |
| checkout: later orders | 9 | 0 | 0 | 200.1 | 226.4 | 226.4 |
| concurrent (5 at once): home page | 18 | 0 | 0 | 68.9 | 201.6 | 201.6 |
| concurrent (5 at once): listings query | 12 | 0 | 0 | 66.3 | 222.7 | 222.7 |

No failed requests and no 429s. Compared with build 88 (first full dev deploy, with the cache Redis, no chaos) the reads are lower and the checkout figures are in the same range (later orders p50 178 to 192 ms then, 200 ms here). Different time, one sample each: this is a second table beside the first, not a measured effect of chaos.

## Latency, from the lead's machine

Run by the agent from the lead's Windows machine after build 117 (about 01:04 UTC), `--where lead`. The environment had scaled to zero in the half hour since the smoke: the warm-up took 155 s in all (issuer 22 s, web 25 s, BFF 26 s, catalog 31 s with 4 attempts, ordering 51 s with 6 attempts, every step "likely cold"), and `dev-chaos` was still on. The latency run came straight after the warm-up.

| Request | n | Failed | 429 | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| first: home page (one request) | 1 | 0 | 0 | 249 | 249 | 249 |
| read: home page (server-rendered) | 30 | 0 | 0 | 55.1 | 110.8 | 114.1 |
| read: listing page (server-rendered) | 30 | 0 | 0 | 48.2 | 108.8 | 120.1 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 0 | 44.8 | 101.7 | 102.2 |
| checkout: first order of the run | 1 | 0 | 0 | 1270.3 | 1270.3 | 1270.3 |
| checkout: later orders | 9 | 0 | 0 | 244.7 | 370.7 | 370.7 |
| concurrent (5 at once): home page | 18 | 0 | 0 | 99.1 | 329.4 | 329.4 |
| concurrent (5 at once): listings query | 12 | 0 | 0 | 97.2 | 242.2 | 242.2 |

Slower than the agent's table across the board (network path from the lead's machine to East US), and the first checkout of the run took 1.27 s, which fits an ordering app just woken. Scale-to-zero timing matters for any latency table: the agent's run came right after the deploy, with every app warm.

## What this shows and does not

- Shows: `dev-chaos` can be switched on for a whole deployed dev environment by the pipeline input, all four apps start it once, the standard suite with the four chaos-aware tests passes against it, three kinds of fault were counted as injected, and every smoke trace id reached the log.
- Does not show: the same build without chaos on UAT (parked, register 235); the concurrency test (skipped); the Playwright report or per-test "fault injected" list (artifact download blocked); the outage fault in the injected counts; latency from the lead's machine.
