# WI-PORT-002 Findings: walking skeleton (SSR -> BFF -> C# listing read)

> **Current result (2026-10-30):** this read path was the first step; slice 1 extended it to ordering, and the real-stack journeys (21) passed in each of 3 runs on 2026-10-30. Where this file says `CorrelationIdMiddleware` trusts an inbound header, that was fixed on 2026-10-28 (see `WI-PORT-005` and ADR-0016): it never adopts the inbound value.

**Date:** 2026-10-28 · **Branch:** `feature/WI-PORT-002-walking-skeleton` · **Code:** `services/graphql-bff/`, `apps/web-customer/`, `azure-pipelines.yml`

## Result

One read path works end to end on this machine against the **real** stack: browser -> Next.js SSR (`apps/web-customer`) -> GraphQL BFF (`services/graphql-bff`) -> `catalog-service` (Cosmos emulator, Redis Streams) with the `WI-DEV-004` seed. Node 25.9.0, Docker Desktop on Windows.

## What was run

| Check | Command | Result |
|---|---|---|
| BFF typecheck | `npm run typecheck` (`services/graphql-bff`) | Pass |
| BFF tests | `npm test` | 16 of 16 pass (fake catalog over real HTTP; golden mapping, paging, errors, trace) |
| Relay compile and web typecheck | `npm run typecheck` (`apps/web-customer`) | Pass, schema read from its new home |
| Web production build | `GRAPHQL_URL=http://localhost:4100/graphql npm run build` | Pass |
| Walking-skeleton smoke | `npm run test:skeleton` (Playwright, Chromium) | 5 of 5 pass against the live stack |
| Catalog and library suites | `dotnet test` | Not re-run for this item; no C# logic changed (only a Development logging setting) |
| Azure Pipelines | `azure-pipelines.yml` | **Not run.** Written only; never executed on Azure DevOps |
| Existing PORT-001 mock e2e | `npm run test:e2e` | 6 of 6 pass after the changes to `environment.ts` and the schema move |
| PORT-001 isolation test | `npm run test:isolation` | **Not re-run** |
| BFF dependency audit | `npm audit` (`services/graphql-bff`) | 0 vulnerabilities |

Mutation check on the BFF tests: changing the price mapping (+1 cent) fails 2 tests. Removing the error-mapping step made the run hang until stopped, so it was detected but not cleanly. The traceparent-forwarding mutation was not completed.

## Trace evidence (ADR-0016)

`trace-excerpt.txt` is one page load. The web tier generated the trace id; the BFF continued it (`continuedTrace: true`) and sent `traceparent` on; catalog-service logged the **same trace id** with `ParentId` equal to the BFF's span id.

| Hop | Shows the trace? |
|---|---|
| Browser -> Next.js | **Gap.** No trace is started in the browser; Next.js starts it per SSR request |
| Next.js -> BFF | Yes, `traceparent` sent; Next itself logs and exports nothing |
| BFF -> catalog-service | Yes, `traceparent` sent, logged by both sides |
| catalog-service -> Cosmos / Redis | **Gap.** No instrumentation |

Not done (belongs to `WI-PORT-005`): OpenTelemetry SDKs, spans exported to a viewer such as Jaeger, and changing catalog's `CorrelationIdMiddleware`, which still trusts an inbound `X-Correlation-Id`. The BFF never reads or forwards that header.

## Errors are client-safe

- BFF unit tests: a downstream 500, a non-JSON body, a timeout and an unreachable service all produce one error with a fixed message, `extensions.code = INTERNAL`, `extensions.reference` = trace id, no `path`, and none of the downstream URL, port, body or stack. The detail goes to the server log only.
- Live: with catalog-service stopped, `/` returns Next's generic 500 page. Its HTML contains no internal host, port or error text. There is no friendly error page and the reference id is not shown to the user yet (page work belongs to `WI-CUST-002`).
- A non-public listing (the seeded Draft) renders a 404.

## Decisions and deviations

- **Schema moved** from `apps/web-customer/schema/` to `services/graphql-bff/schema/schema.graphql` so the BFF and the Relay compiler share one file. `relay.config.json` and the mock server point at it.
- The BFF uses `graphql-js` directly (no server framework) and Node's built-in TypeScript type stripping, so its only runtime dependency is `graphql`. `node >= 24` is required.
- Read-only subset only: `listings`, `listing`, `node`. `pickupWindows`, `order` and `placeOrder` are not in the schema yet.
- Ports: BFF 4100, catalog-service 5200, web 3000. The PORT-001 mock stays on 4000.
- Caching: BFF responses are `private, no-store`. Public listing caching is `WI-PORT-004`.
- Not done: auth (anonymous reads only). First paint makes no browser GraphQL call (the smoke test asserts it), so the same-origin `/api/graphql` rewrite was not exercised against the real BFF.

## Limits

- Chromium only. Not run on an LTS Node. 
- Single machine, no load, no concurrency test of the BFF.

## Next smallest task

`WI-PORT-003` (CI baseline: required checks, publish results, wire in the skeleton smoke with Compose) or `WI-PORT-005` (OpenTelemetry and a trace viewer), then `CUST-002` for real error and empty-state pages.
