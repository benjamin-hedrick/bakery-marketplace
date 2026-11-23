# Tracing in the deployed dev environment, build 120 and a live fix (2026-11-22)

> **Status:** Current · `WI-OBS-001` step 6, the evidence. Dev pipeline build **120** (the lead's run, UTC 2026-11-23 03:34 to 03:51) with `dev-chaos` on, `tracing` on and `cacheRedis` off, then a live session on the same running environment (UTC 04:10 to 04:50) in which the tracing was found not to work as deployed, fixed by hand on the live apps, and the chaos traces read. Read from the build's step logs and from Application Insights and the Log Analytics workspace with the lead's Azure sign-in. **The deployed Terraform is not fixed by this run: the fix is on a branch and has not been deployed** (register 237). Counts, ids, app names, operations and durations only; no query text, no headers, no bodies.

## What build 120 did and did not show

- All stages succeeded. The deployed customer suite from the agent: **16 passed, 0 skipped** (1.7 min), including **test 11, five customers order the last units at once** (1.2 min), which build 117 had skipped because the environment was not fresh. This run was a fresh create, so the concurrency path was exercised.
- The chaos tests (06b) all passed, with the same caveat as build 117's record: each asserts an outcome that holds with or without the fault.
- **No span reached Application Insights.** Every `App*` table was empty over all time, the collector logged nothing after "Everything is ready", and the observe stage found 0 of 40 correlation ids in Application Insights (6 reads), printed `NOT READ` for its spans query, and read 0 injected faults and 0 ids in the console log. The last two were reads made before the log had landed (a re-query minutes later found them); the first is real.

### Latency, from the agent (build 120, 5 apps warm, the warm-up reported no cold start, total 951 ms)

| Request | n | Failed | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|
| first: home page (one request, may include a cold start) | 1 | 0 | 95.8 | 95.8 | 95.8 |
| read: home page (server-rendered) | 30 | 0 | 25.2 | 93 | 98.8 |
| read: listing page (server-rendered) | 30 | 0 | 20.9 | 31.7 | 41.4 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 17.1 | 36.8 | 153.7 |
| checkout: first order of the run | 1 | 0 | 149.6 | 149.6 | 149.6 |
| checkout: later orders | 9 | 0 | 189 | 212.8 | 212.8 |
| concurrent (5 at once): home page | 18 | 0 | 84.9 | 122.5 | 122.5 |
| concurrent (5 at once): listings query | 12 | 0 | 82.3 | 90.6 | 90.6 |

### Latency, from the lead's machine (the same environment, about 04:46 UTC, after the four apps' revisions had been replaced by hand and the suite had just run, so the apps were warm; the earlier suite run at 04:12 had needed a 181 s warm-up because the apps had scaled to zero)

| Request | n | Failed | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|
| first: home page (one request, may include a cold start) | 1 | 0 | 205.2 | 205.2 | 205.2 |
| read: home page (server-rendered) | 30 | 0 | 36.3 | 40.4 | 77.9 |
| read: listing page (server-rendered) | 30 | 0 | 32.5 | 74.7 | 135 |
| read: listings query (/api/graphql, anonymous) | 30 | 0 | 28.7 | 65.8 | 107.3 |
| checkout: first order of the run | 1 | 0 | 177.7 | 177.7 | 177.7 |
| checkout: later orders | 9 | 0 | 166 | 210.8 | 210.8 |
| concurrent (5 at once): home page | 18 | 0 | 88.8 | 211.3 | 211.3 |
| concurrent (5 at once): listings query | 12 | 0 | 35.5 | 210.7 | 210.7 |

The two tables are from different machines at different times and the second ran on a changed environment; they are not a controlled comparison. The latency figures include no tracing overhead measurement.

## Why no span arrived

The apps were configured with `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector`. From inside catalog (`az containerapp exec`), `ordering` and `mock-oidc` resolved by their short names (`<app>.k8se-apps.svc.cluster.local`), but `otel-collector` did not, on three tries across the session (a fourth failed because catalog had scaled to zero, and says nothing); the collector's full internal address (`otel-collector.internal.<default domain>`) did. Azure's ingress request metric for the collector read 0 in every window while catalog's read 166 to 445 per 15 minutes. So no request ever reached the collector, and the exporters, which fail without a message, said nothing. Why this app lacks the short name is not known. Register 237.

First guess, ruled out: the ingress redirects http to https unless `allowInsecure` is set. Setting it (live) and running the suite changed nothing, while the apps still used the short name.

## The live fix and what it showed

On the running environment, by hand (these are not in Terraform and go with the environment's teardown): the collector's ingress `allowInsecure` set to true; then `OTEL_EXPORTER_OTLP_ENDPOINT` set to the full address on catalog (one new revision), and, once spans arrived within about two minutes, on ordering, graphql-bff and web. The chaos settings (`Chaos__Enabled`, `Chaos__Scenario=dev-chaos`) were unchanged on the new revisions. Whether the full address works with `allowInsecure` off was not tested.

The deployed suite was then run from the lead's machine (UTC 04:41 to 04:42): **15 passed, 1 skipped** (test 11: the lemonade was already sold out by build 120's own concurrency run). Spans were counted at 04:45 once the count stopped growing: **449 spans** over the four apps (requests and dependencies).

## The traces

Trace ids are of this environment, which has been torn down. A span's duration is as exported; "failed" is the span's own status.

**A lost payment answer (`payment:lost`), trace `d07f5b12b25388bc1911ae8d304ffd47`: 8 spans across graphql-bff, ordering-service and catalog-service.**

| Span | App | Result | ms |
|---|---|---|---:|
| POST /graphql | graphql-bff | 200 | 121.2 |
| POST /ordering/checkout | ordering-service | **503, failed** | 113.8 |
| GET (call to catalog) | ordering-service | 200 | 6.0 |
| GET /catalog/listings/{id} | catalog-service | 200 | 0.3 |
| POST (call to catalog: reserve stock) | ordering-service | 201 | 39.1 |
| POST /catalog/stock/reservations/ | catalog-service | 201 | 34.9 |
| DELETE (call to catalog: release the reservation) | ordering-service | 200 | 21.8 |
| DELETE /catalog/stock/reservations/{orderId} | catalog-service | 200 | 17.9 |

The checkout reserved the stock, the payment answer was lost (503), and the reservation was released: the compensation is visible as the DELETE.

**A stock check that says no (`catalog:reject`), trace `ff1394e651429592c3327d8888034bb3`: 4 spans.** graphql-bff POST /graphql 200 (71.1 ms); ordering-service POST /ordering/checkout **409, failed** (63.5 ms); ordering-service GET to catalog 200 (4.3 ms); catalog-service GET /catalog/listings/{id} 200 (0.3 ms). Ordering read the listing and refused; no reservation was made.

**A slow BFF for one caller's own trace (`bff:latency`), trace `c4a05000000000000000000000000001` (the test's own id): 2 spans.** graphql-bff POST /graphql 200 in **2005.3 ms**; catalog-service GET /catalog/listings/ 200 in 0.3 ms. The delay is in the BFF span, not below it.

**An outage switched on and off by reading two listings (`unavailable`), trace `72fa0a7db5107253a91a4ae9b2273394`: 3 spans.** web-customer POST 11.0 ms, graphql-bff POST /graphql 200 (7.2 ms), catalog-service GET /catalog/tags 200. Its fault line is in the console log as injected (this is the fault the observe stage of build 117 did not count, register 236); the trace itself shows the calls around it and does not show where the outage was applied.

**A plain order, trace `7c48aa630f73d735eff0bfc3b0d7ab1a`: 7 spans, no failure.** graphql-bff POST /graphql 200 (1021.1 ms, the first order of the run); ordering-service POST /ordering/checkout 201 (1009.7 ms); ordering's call to catalog GET 200 (76.8 ms) and catalog's GET /catalog/listings/{id} (0.7 ms); ordering's call to the issuer (the service token) 200 (22.5 ms); ordering's call to catalog POST 201 (276.8 ms) and catalog's POST /catalog/stock/reservations/ 201 (258.7 ms). No DELETE.

### What these traces do not show

- **The web app's span is absent from the traces that came through the browser's route** (the lost payment, the rejected stock check, the slow BFF and this plain order): they begin at the BFF. The web server exported spans only for the server-rendered pages' calls (107 `POST` dependencies named just "POST"); the `/api/graphql` route it relays browser calls through made none. A span for that route is built on the branch (`packages/web-session`) and **not yet deployed or seen in a trace**.
- The notification service is not deployed, so no trace crosses it.
- The first order's 1 s is the first checkout of a cold path (the issuer token, the first reservation); the span list does not say which part was cold.
- No sampling: DEV keeps every span (the volume here was 449 spans in about a minute). Cost and ingestion of the resource were not measured.

## What changed in the repository because of this

- The apps' endpoint and the collector's ingress in `infra/modules/environment/main.tf` (plan tests assert both; the Terraform checks, including those plan tests against the mocked provider, passed afterwards, 11 of 11; the change itself has not been applied to Azure).
- The web server's `/api/graphql` span (`packages/web-session`, unit tests pass).
- The observe stage waits for the console log as it does for spans, and says `NO SPANS` and exits 1 when tracing is on and no smoke id has a span.
- Register 237 (this finding), and an update to 236.
- Not done: a fresh create with these changes, which is what would show the tracing working without a manual step.
