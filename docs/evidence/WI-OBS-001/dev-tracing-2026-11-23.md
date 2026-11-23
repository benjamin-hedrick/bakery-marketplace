# Tracing in the deployed dev environment, build 123, a fresh create with the fix (2026-11-23)

> **Status:** Current · `WI-OBS-001` step 6, the second evidence record (the first is `dev-tracing-2026-11-22.md`, where tracing exported nothing). Dev pipeline run **123** (build number 20261123.5, source `35f5eeb` on `main`, the lead's run, UTC 2026-11-23 17:54 to 18:29) with `deploy`, `chaosScenario: dev-chaos`, `tracing: true`, `cacheRedis: false`, `seed: true`. Read from the run's step logs (`az devops invoke` of the build timeline and logs) and from the Log Analytics workspace with the lead's Azure sign-in. No value of a secret was read or printed.

## What the run showed

- **All stages succeeded** (from the timeline: image build about 3 minutes, infrastructure apply about 18 minutes, application deploy about 5, smoke about 3.5, observe about 1). The environment was created from empty, so this is the first create with the tracing fix of register 237.
- **Tracing works with no manual step.** Application Insights held the smoke run's spans: **40 of 40 correlation ids found in Application Insights on the first read, and 40 of 40 in the console log.** Run 120 had found 0 of 40 in both.
- **The deployed customer suite: 16 passed, 0 skipped** (2.1 min), including the four chaos tests and test 11 (five customers order the last units at once, 1.3 min).
- **Chaos traces.** The observe stage read one trace for each of three faults, each across web, BFF, ordering and catalog where the call goes that far:

| Fault | Trace | Spans | Apps | Failed | Longest |
|---|---|---:|---|---:|---:|
| `payment:lost` | `1dae3411…` | 9 | web-customer, graphql-bff, ordering-service, catalog-service | 1 | 206 ms |
| `bff:latency` | `c4a05000…` | 3 | web-customer, graphql-bff, catalog-service | 0 | 2014 ms |
| `catalog:reject` | `e8cf9c12…` | 5 | web-customer, graphql-bff, ordering-service, catalog-service | 1 | 31 ms |

  The web app's own span (the `/api/graphql` server-side span added on `feature/dev-chaos-traces`) is the `web-customer` entry: it appears in every trace. The fourth fault (the outage, read through the BFF's catalog layer) is not in this table; see the first defect below.
- **Spans in the window, read afterwards by hand** (the observe stage's own read of this failed, see below): catalog-service 443 requests and 15 calls out, web-customer 203 and 128, graphql-bff 331 requests, ordering-service 119 and 73; failed spans 3 in catalog-service requests, 5 in ordering-service requests and 3 in its calls out.
- **Replicas** started 13 to 42 seconds after they were assigned. `web`, `ordering` and `mock-oidc` each show a restart count of 1 in the window; not investigated.

### Latency, from the agent only (the lead's machine was not run in this session)

| Request | n | Failed | p50 ms | p95 ms | max ms | Budget p95 (`nfrs.md` section 8) |
|---|---:|---:|---:|---:|---:|---:|
| first: home page (one request) | 1 | 0 | 292.6 | 292.6 | 292.6 | outside the budget |
| read: home page | 30 | 0 | 82.7 | 88.1 | 88.5 | 250 |
| read: listing page | 30 | 0 | 80.4 | 103.3 | 103.5 | 250 |
| read: listings query (anonymous) | 30 | 0 | 78.1 | 83.6 | 84 | 250 |
| checkout: first order of the run | 1 | 0 | 338.7 | 338.7 | 338.7 | outside the budget |
| checkout: later orders | 9 | 0 | 198.9 | 271.7 | 271.7 | 500 |
| concurrent (5 at once): home page | 18 | 0 | 94 | 220.7 | 220.7 | 500 |
| concurrent (5 at once): listings query | 12 | 0 | 92.9 | 224.6 | 224.6 | 500 |

Every measured p95 is inside the budget. One sample, warm apps, so this is a reading and not a measured guarantee.

## Two defects the run found in the observe stage (register 236, fixed in the same change)

1. **The span count never ran: "NOT READ: log query spansPerApp".** The query failed in the workspace with two errors, found by running it by hand: `kind` is a reserved word in the query language (`SYN0002`, the query does not parse), and after renaming it `itemType` is a column of the classic tables, not of `AppRequests` and `AppDependencies` (`SEM0100`; those have `Type`). The offline tests could not see either, because they do not parse the query language. Fixed (`spanKind = Type`); a test pins the column name and the absence of the reserved word, and fails against the old query.
2. **The outage fault was not counted as injected, as in build 117.** The BFF writes the layer of the outage fault as `bffCatalog`, and the observe stage's patterns read lowercase letters and hyphens only, so the line was dropped (the other layers are all lowercase, which is why only this fault went missing). The workspace did hold the line (`"msg":"chaos injected","layer":"bffCatalog","fault":"unavailable"`, one line, from `graphql-bff`). Fixed (the patterns accept capitals); a test reads a line with that layer name and fails against the old patterns. The same patterns also cut `lostResponse` to `lost` in this run's table above (`payment:lost`); with the fix the name reads in full.

**Checked on the live workspace after the fix** (the window of this run, read-only): every query the observe stage builds now parses and runs, and `chaosInjected` returns four rows (`payment lostResponse`, `bffCatalog unavailable`, `bff latency`, `catalog reject`) and `chaosTraces` four, where the run read three of each. This was run by hand against the live workspace, not by the pipeline.

## What this shows and does not

- Shows: a fresh create of the stack carries traces from the browser-facing app through the BFF to both services, with no manual step, and the chaos faults can be followed as traces; the observe stage's evidence reads well enough to show it.
- Does not show: the fixed observe stage running in the pipeline (the changes are on a branch); a fourth chaos trace in a pipeline run; Application Insights' own cost; the teardown of this environment.
