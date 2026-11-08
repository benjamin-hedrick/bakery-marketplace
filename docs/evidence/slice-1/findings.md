# Slice 1 findings: the customer journey on the real local stack, and a trace through it

> **Current result (2026-10-30):** the slice-1 journey passed 21 of 21 on the real stack, one checkout is one trace across the BFF, ordering and the catalog, and a scan of every exported span found no token, key or secret. Later runs (62 journeys on 2026-11-07) are in the newer records.

**Date:** 2026-10-28 · **Branch:** `feature/slice-1-evidence` · **Status:** verified locally on the real stack; the pipeline run `#20261029.4` on Azure passed (reported by the human lead, section 5)

Scope is `docs/architecture/first-slice-contract.md`: login, browse, customize, choose a pickup window, test checkout, confirmation and status. Plan and status: `docs/management/slice-1/`. Item numbers below are rows of `docs/governance/open-items-register.md`.

## 1. What was run

`node scripts/ci/skeleton-smoke.mjs` (the same command the pipeline's `skeleton` job runs) on a Windows development machine: it creates the local client secret, starts Compose (Redis Streams, the Cosmos emulator, the mock OIDC issuer), seeds, starts `catalog-service` and `ordering-service` (Cosmos and Redis backends), the GraphQL BFF with the test hook on and the Next.js production build, then runs Playwright against them with Chromium 156 (Playwright 1.64.0), and tears everything down.

| Suite (all in one run) | Result |
|---|---|
| `journey.spec.ts`: the customer journey in a browser | 6 passed |
| `login.spec.ts`: login through the real issuer's own page | 2 passed |
| `issuer.spec.ts`: no markup reflected, only a registered `redirect_uri` (open item 32) | 3 passed |
| `stack.spec.ts`: BFF reaches ordering, ordering validates the issuer's tokens, ordering reaches the catalog with its own credential | 5 passed |
| `walking-skeleton.spec.ts`: server-rendered browse, hydration, detail, not-found, BFF surface | 5 passed |
| **Total** | **21 of 21** (about 19 s of tests after about 3 minutes of start-up) |

The journey tests cover: a plain order that confirms by itself (`Confirmed`); an order with an option and a pickup time that waits for the bakery (`Placed`); a declined test payment that keeps the order, takes nothing from stock, and then goes through under a new key; asking for more than is in stock (the page names how many are left and taking that many works, and the shelf then reads "Sold out"); a sold-out item that cannot be ordered; and a clean browser console. Stock is read from the catalog as the vendor to confirm every reservation and release.

The other suites run for the same tip of the branch: web unit tests 53 passed; BFF 75 passed; mock-backed browser tests 57 passed; web format, lint and typecheck clean; the Linux container check (`node scripts/ci/linux-check.mjs`, real Redis: Auth 133, catalog 104, ordering 337 passed, Redis saw 128 commands where 50 are required).

## 2. A trace through the slice

Method. A throwaway OpenTelemetry Collector (`otel/opentelemetry-collector-contrib:0.164.0`) received OTLP/HTTP on `127.0.0.1:4318` with the same data-safety processor as `infra/otel-collector/local.yaml` (it deletes `url.query` and `http.url`) and a `debug` exporter writing every span to its log. The whole smoke above was run with `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf` in the environment, so every service and the Next.js server exported. A small script then read the log back. 494 spans, 103 traces, 21 of 21 tests still passing with tracing on (this also closes the "skeleton smoke was not run with tracing" part of item 42).

**A checkout is one trace across the BFF, ordering and the catalog** (trace `9b18524c61c4c84ed045816caa20265c`, the first checkout of the run; indentation is parentage):

```
graphql-bff        Server  POST /graphql                                       4681 ms  (no parent: the browser is not traced, section 5)
  ordering-service   Server  POST /ordering/checkout                           4675 ms  201
    ordering-service   Client  GET   issuer /.well-known/openid-configuration  2031 ms  (first use: validating the customer's token)
    ordering-service   Client  GET   issuer /.well-known/jwks.json                 3 ms
    ordering-service   Client  GET   Cosmos orders/docs/...                        5 ms  404  (is there already an order for this key? no)
    ordering-service   Client  GET   catalog /catalog/listings/listing-sourdough-001   22 ms
      catalog-service    Server  GET /catalog/listings/{id}                    18 ms  (parent: the ordering client span)
        catalog-service    Client  POST, GET, GET  Cosmos catalog/docs           7, 4, 4 ms  (a query, a 404, a read)
    ordering-service   Client  POST  issuer /token                            2054 ms  (first use: ordering's own service token)
    ordering-service   Client  POST  catalog /catalog/stock/reservations       190 ms  201
      catalog-service    Server  POST /catalog/stock/reservations            183 ms  (parent: the ordering client span)
        catalog-service    Client  GET, GET, GET, POST  Cosmos catalog/docs    6, 4, 3, 9 ms  (reads, then the transactional write)
    ordering-service   Client  POST  Cosmos orders/docs                         9 ms  201  (store the order and its events together)
    ordering-service   Client  PUT   Cosmos orders/docs/...                      7 ms  200  (clear the outbox once published)
```

One trace id on every hop, and each server span's parent is the client span that called it, so the chain is unbroken across three services and two stores. Checkout durations over the run: 4675 ms for the first, then 78, 78, 68, 55, 76, 67, 67 and 70 ms.

**A page load is one trace across the web server, the BFF and the catalog** (trace `bb5182ee9d751bcf3999e76134abaac2`): `web-customer` Client `POST graphql (BFF)` (435 ms) → `graphql-bff` Server `POST /graphql` (415 ms) → `catalog-service` Server `GET /catalog/listings/` (357 ms) with its Cosmos calls below. 21 traces of this shape in the run.

Service sets per trace over the run: catalog alone 29, catalog + BFF + web 21, BFF + ordering 16, ordering alone 9, catalog + BFF + ordering 9, catalog + BFF 8, BFF + web 5, BFF alone 2. (Four more traces came from `docker buildx` exporting because I had the variable in my shell; they are not the application and are left out of everything above.)

## 3. What is exported (the data-safety check)

Attribute names exported per service, from the spans themselves:

| Service | Attributes |
|---|---|
| graphql-bff | `http.request.method`, `http.response.status_code`, `url.path` |
| web-customer | `http.request.method`, `http.response.status_code` |
| ordering-service | `error.type`, `http.request.method`, `http.response.status_code`, `http.route`, `network.protocol.version`, `server.address`, `server.port`, `url.full`, `url.path`, `url.scheme`, `user_agent.original` |
| catalog-service | the same, plus `messaging.event.id` |

A scan of every exported span (name and all attributes) for things that must never leave the process found **none** of: a JWT (`eyJ...`), a bearer credential, the word `authorization`, an idempotency key (`checkout-...`) or the word `idempotency`, a secret or password, an email address, the customer's id or name, or any query-string value. The only hit on a list of identifiers was `vendor-shop-001`, a seeded vendor id, inside a Cosmos document URL on a catalog span: a business identifier, not personal data. This is the first scan of **authenticated** flows (the earlier tracing evidence covered one unauthenticated request): the run included real logins, token exchanges, orders and a declined payment.

## 4. Observations

- **The first checkout of a cold stack is slow (about 4.7 s), the rest are fast (55 to 78 ms).** The first one paid about 2 s to fetch the issuer's metadata (to validate the customer's token) and about 2 s to fetch ordering's service token, both from a cold mock-issuer container. The BFF's checkout timeout is 15 s and ordering's own call timeout is 5 s, so it fits, but a demo's first order will feel slow. Not a defect; worth warming the issuer before a demo.
- **Spans marked `Error` are mostly expected.** 32 on the catalog and 10 on ordering are Cosmos reads that returned 404 (is there a reservation or an order yet?); 1 is the catalog refusing an over-order with 409; 3 BFF spans are GraphQL answers that carry an error (an unauthenticated read, a forbidden role, a scripted failure) while the HTTP status is 200. A dashboard that counts `Error` spans as failures will overstate failures.
- **The .NET services export nothing unless the protocol is also set.** With only `OTEL_EXPORTER_OTLP_ENDPOINT` set, the first capture contained only the BFF and the web server: the .NET exporter defaults to gRPC, which is silently dropped by an HTTP port. `docs/operations/local-dev.md` already says to set `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`; the failure is silent, which is the hazard (open item 82).

## 5. Not traced, not verified, not done

- **The browser hop is not traced.** The browser's calls to the BFF carry no `traceparent`, so a checkout's trace starts at the BFF; only a server-rendered page load starts at the web server. A trace from the click would need browser instrumentation (item 36 and ADR-0016).
- **Azure.** The pipeline's `skeleton` job starts ordering-service and relies on a secret created on a clean agent. The first Azure run of this work found one bug, in a test (a regex that assumed a one-digit hour in a pickup time, which holds in Eastern time and not at 12:00 UTC on the agent), and nothing else in that job. After the fix, Azure Pipelines run **`#20261029.4`** (the PR build of `feature/slice-1-hardening`) was reported by the human lead as passed and completed, so the whole smoke, including ordering-service, the browser journey and the secret created on a clean agent, has run on Azure. Recorded: build id **18** (as the human lead gave it). What is **not** recorded: a link, and per-job counts (not read from Azure). The tracing capture in section 2 is a local run only; it was not repeated on Azure.
- **Nothing here touched** real Azure Cosmos, a managed Redis, Application Insights (the collector's `cloud.yaml` is syntax-checked only, item 37), or any deployed environment.
- **No order event has a subscriber yet**, so the order events (`OrderPlaced`, `OrderConfirmed`) leave the outbox but no consumer span follows them. The catalog's own consumer spans (`messaging.event.id`) were seen.
- **Log correlation was not re-checked** for ordering (the catalog's console scopes carry `TraceId`; ordering uses the same setup and was not read from its log).
- **Estimates and timings** are from one machine and one run; they show shape, not a benchmark.

## 6. Reproduce

1. `docker run -d --name trace-capture -p 127.0.0.1:4318:4318 -v <dir with capture.yaml>:/etc/otelcol:ro otel/opentelemetry-collector-contrib:0.164.0 --config=/etc/otelcol/capture.yaml`, where `capture.yaml` is `infra/otel-collector/local.yaml` with its `otlp` receiver reduced to `http` on `0.0.0.0:4318` and the exporter replaced by `debug: { verbosity: detailed }`.
2. `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf node scripts/ci/skeleton-smoke.mjs` (unset the variables in the shell afterwards; `docker buildx` also exports to the endpoint while they are set).
3. `docker logs trace-capture`, group the `Span` blocks by `Trace ID`, and follow `Parent ID`.
