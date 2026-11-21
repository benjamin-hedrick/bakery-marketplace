# The first complete dev deploy, 2026-11-21

> **Status:** Current · build 88 of the dev pipeline (`azure-pipelines-dev.yml`, action `deploy`, plan mode `real`, from `main` at `cb3d2bf`) ran every stage and succeeded: plan, apply, images, application deploy, smoke and observability. The same afternoon the deployed suite and the latency run were repeated from the lead's machine, and the cold starts were measured (register 228). The environment was still up when this was written; its teardown is recorded separately.

Read from the run's timeline and step logs (`az devops invoke`, the lead's sign-in) and, for the lead's runs, from the lead's machine. The run's artifacts (`dev-smoke`, `dev-observe` and the others) could not be downloaded with the same sign-in (`TF400813` from the artifact service), so the numbers below are the ones the steps printed. No address, resource name, subscription or identity appears here.

## The run, stage by stage

| Stage | Started (UTC) | Took | Result |
|---|---|---:|---|
| Check the inputs | 15:19 | 10 s | passed |
| Build the six images (no credentials) | 15:19 | 3 min 23 s | passed |
| Infrastructure plan (read-only identity) | 15:23 | 1 min 7 s | 27 to create |
| Approval `dev-infra` | 15:24 | 1 min 13 s waiting | approved by the lead |
| Infrastructure apply | 15:25 | 17 min 30 s | re-plan matched the approved plan; 27 added, 0 changed, 0 destroyed |
| Approval `dev-app` | 15:43 | 38 min 47 s waiting | approved by the lead |
| Application deploy | 16:21 | 5 min 12 s | 6 images pushed by digest; 5 apps on build 88 |
| Post-deploy smoke (no credentials) | 16:27 | 3 min 8 s | 12 of 12 passed; latency 0 failed |
| Observability (read-only identity) | 16:30 | 57 s | read; 40 of 40 correlation ids found |

**The apply:** the Container Apps environment took **14 min 43 s** to create (the 2026-11-20 normal create took 14.5 minutes; the stuck one 77, register 227), the Key Vault 2 min 18 s, the Cosmos account 1 min 41 s, the wait after the Key Vault role assignments 1 min 30 s, the three placeholder secrets about 2 minutes each.

**The application deploy:** the deploy identity's own role check passed, the post-apply secret step set the placeholders, six images were pushed (catalog, ordering, BFF, web, mock issuer, seed) and recorded by digest, and each of the five apps got a new revision `<app>--b88-1` at its pushed digest (the step refuses an older build). It printed `dev deploy: build 88 runs in all 5 apps`.

## The smoke from the pipeline's agent

The deployed customer suite (`apps/web-customer/playwright.deployed.config.ts`) ran straight after the deploy, so every app had just started: **12 passed in 1.8 minutes**, including test 11 (five customers ordering the last two units of the seeded lemonade at once; 1.3 minutes, most of it the wait for the login limit). Its per-customer outcomes are in the `dev-smoke` artifact, not read here.

Latency from the agent (`scripts/ci/deployed-latency.mjs --where agent`, a Microsoft-hosted agent):

| Request | n | Failed | 429 | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| first: home page | 1 | 0 | 0 | 262 | 262 | 262 |
| read: home page (server-rendered) | 30 | 0 | 0 | 79.3 | 118.1 | 188.1 |
| read: listing page (server-rendered) | 30 | 0 | 0 | 76.1 | 86.5 | 106 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 0 | 73.1 | 79.8 | 94.1 |
| checkout: first order of the run | 1 | 0 | 0 | 165.8 | 165.8 | 165.8 |
| checkout: later orders | 9 | 0 | 0 | 178.1 | 201.5 | 201.5 |
| concurrent (5 at once): home page | 18 | 0 | 0 | 79.1 | 187.9 | 187.9 |
| concurrent (5 at once): listings query | 12 | 0 | 0 | 74.6 | 189.1 | 189.1 |

## What the platform saw

`scripts/ci/dev-observe.mjs`, window 16:19 to 16:30 UTC, the read-only identity:

| App | Requests | Replicas (max) | Restarts | Memory (max) |
|---|---:|---:|---:|---:|
| web | 139 | 1 | 0 | 152 MiB |
| graphql-bff | 28 | 1 | 0 | 134 MiB |
| catalog | 37 | 1 | 0 | 156 MiB |
| ordering | 5 | 1 | 0 | 162 MiB |
| mock-oidc | 20 | 1 | 0 | 152 MiB |

- **Correlation:** 40 of the 40 newest correlation ids the suite recorded (`X-Correlation-Id`, the trace id, ADR-0016) were found in the apps' console log.
- **Error-like console lines:** one app had some (one row of the count query). Read afterwards from the lead's sign-in: ordering, at 16:26:42, four seconds after its container started. Its orphan-reservation sweeper and its catalog gateway logged a warning with a socket exception: their first call to catalog came a second before catalog's own new revision started (16:26:43). A warning during a rolling deploy, handled, not repeated.
- The request counts are the platform metric's, at one-minute grain; they do not add up to the suite's requests one for one.
- In the 45 minutes after the run, each of the three Redis apps and the BFF had one failed probe, none repeated.

## From the lead's machine, the same afternoon

**Cold:** the apps had scaled to zero by 16:44. The suite started at 16:50 and got **8 passed, 3 failed, 1 skipped in 5.0 minutes**:

- Test 1 passed but took 3.0 minutes: the web app, then the BFF, then catalog started from zero, one after the other, as each was first called.
- Test 3 failed: the mock issuer's first answer took longer than the test's 30-second request limit.
- Tests 5 and 6 failed: ordering was still starting when the checkout asked for the pickup windows, so the list never loaded within 30 seconds (the field stays disabled while the query is loading or has failed).
- Test 11 skipped by design: build 88's smoke had sold the lemonade, and the test needs a freshly seeded environment.

**Warm, straight after:** **11 passed, 1 skipped (test 11) in 15.7 seconds.** The failures were cold starts, not faults.

Latency from the lead's machine (`--where lead`, warm):

| Request | n | Failed | 429 | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|---:|
| first: home page | 1 | 0 | 0 | 148.8 | 148.8 | 148.8 |
| read: home page (server-rendered) | 30 | 0 | 0 | 42.6 | 80 | 162.4 |
| read: listing page (server-rendered) | 30 | 0 | 0 | 39.5 | 53.6 | 119 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 0 | 37.3 | 42.3 | 46.7 |
| checkout: first order of the run | 1 | 0 | 0 | 164.9 | 164.9 | 164.9 |
| checkout: later orders | 9 | 0 | 0 | 192.2 | 210.2 | 210.2 |
| concurrent (5 at once): home page | 18 | 0 | 0 | 58.2 | 92.7 | 92.7 |
| concurrent (5 at once): listings query | 12 | 0 | 0 | 49.2 | 81.7 | 81.7 |

The lead's reads are about half the agent's (the agent is a Microsoft-hosted machine, the lead's is near East US over a home connection); checkouts are the same from both, so they are dominated by the services and Cosmos, not the network.

## Cold starts (register 228)

The apps keep scaling to zero (ADR-0020, decision 7): for a demo that is the point. What a cold start costs is now measured on both sides.

**The client's side:** `scripts/ci/deployed-warm-up.mjs` (built after the cold run, and since then the deployed suite's global setup) wakes the apps one at a time in the order they call each other and times each until its first good answer. First run, from the lead's machine, every app idle:

| Step | Wakes | Started (UTC) | Answered in ms | Attempts |
|---|---|---|---:|---:|
| issuer | mock-oidc | 17:08:46 | 23 732 | 1 |
| web | web | 17:09:10 | 20 340 | 1 |
| bff | graphql-bff | 17:09:30 | 25 805 | 1 |
| catalog | catalog | 17:09:56 | 21 235 | 3 (two answers from the BFF with an error while catalog started) |
| ordering | ordering | 17:10:17 | 20 583 | 3 (the same) |

Total 112 seconds before the first test.

**The suite with the warm-up as its global setup**, from the lead's machine at 17:21, after the apps had scaled to zero again: **11 passed, 1 skipped (test 11) in 4.0 minutes**, the same tests that had failed cold now passing. The warm-up took longer this time:

| Step | Wakes | Started (UTC) | Answered in ms | Attempts |
|---|---|---|---:|---:|
| issuer | mock-oidc | 17:21:00 | 44 266 | 1 |
| web | web | 17:21:45 | 46 398 | 1 |
| bff | graphql-bff | 17:22:31 | 46 622 | 2 (a 502 first) |
| catalog | catalog | 17:23:18 | 31 238 | 4 |
| ordering | ordering | 17:23:49 | 50 677 | 6 |

Total 219 seconds. The error-like lines in the environment's log for the lead's runs are the BFF's `DownstreamError` for each answer it gave while a service was starting (the "not ready" attempts above), and the web app's own 35-second timeouts in the first cold run: the cold starts themselves, nothing else.

**The platform's side:** from the environment's system log, the time from the platform assigning a replica to its container starting (the app's own start-up comes after it; `dev-observe.mjs` now reports these as `coldStarts`):

| When | Why | mock-oidc | web | graphql-bff | catalog | ordering |
|---|---|---:|---:|---:|---:|---:|
| 16:25 to 16:27 | build 88's new revisions | 41.0 s | 41.5 s | 41.1 s | (not paired) | 20.1 s |
| 16:50 to 16:54 | the lead's cold suite | 41.9 s | 45.1 s | 41.9 s | 43.0 s | 40.1 s |
| 17:08 to 17:10 | the first warm-up | 17.7 s | 16.9 s | 18.0 s | 16.1 s | 15.0 s |
| 17:21 to 17:24 | the suite's warm-up | 44.0 s | 41.1 s | 43.0 s | 16.7 s | 41.9 s |

The last row was read with `dev-observe.mjs --since` from the lead's machine. The same images started in about 17 seconds at one time and about 42 at another; the platform does not say why (image pull time is the likeliest difference, not checked). The client's times add the app's own start-up, and the retries while a service behind the BFF starts, to the platform's.

## Cost

Actual cost from Cost Management for 2026-11-20 and 2026-11-21 (to the time of reading): about **0.15 USD**, nearly all the container registry (about 0.07 to 0.08 USD a day). Cosmos is 0 on the free tier. Container Apps showed no charge yet, either inside the monthly free grant for consumption apps or not yet reported (cost data can lag by a day); to be read again before it is taken as zero.

## Not covered here

- The run's artifacts (the suite's HTML report, the concurrency test's per-customer outcomes): not downloadable with the lead's command-line sign-in. The warm-up and replica-start tables now print to the step logs, which can be read.
- The warm-up in the pipeline: built after build 88, so it has not run there yet.
- The teardown of this environment.
