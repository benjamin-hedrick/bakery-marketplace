# Patterns used in this repository

> **Status:** Current · written 2026-10-30; reviewed against the code and the evidence on 2026-11-08, which is the review of caching, fallback and degradation recorded as register item 89 (sections 7, 9, 14, 15 and 16 are the result). For each pattern: what it is, where it is applied, and how it is verified. Behaviour under failure is in section 14, with how each row was established; section 15 says what each technique is tested against; section 16 lists what the review found.

## 1. Adapter, fallback and contract tests (and a chaos decorator where resilience matters)

An interface, a real implementation and a local or fake one, a shared abstract contract-test base that every implementation inherits, and a chaos decorator that injects failure. New infrastructure code follows it (`CLAUDE.md`).

| Library | Interface | Real | Local or fake | Contract tests | Chaos |
|---|---|---|---|---|---|
| `tools/BakeryMarketplace.Caching` | `ICacheProvider` | Redis provider | `LocalCacheProvider` (`IMemoryCache`) | `CacheProviderContractTests` | `ChaosCacheProvider`, and `ResilientCacheProvider` as the circuit-breaking fallback |
| `tools/BakeryMarketplace.Data` | `IRepository<T>` | `CosmosRepository<T>` | fake repository | `RepositoryContractTests`, `BatchContractTests`, `ConcurrencyContractTests` | none |
| `tools/BakeryMarketplace.Eventing` | `IEventPublisher`, `IEventSubscriber` | Redis Streams transport | in-memory transport | `EventTransportContractTests` | `ChaosEventTransport` (`EVT-004`, `CHAOS-001`): publish failures, latency, outage window, dropped, duplicate and out-of-order delivery, failing handlers; seeded and switched on by a scenario file in a running service (ADR-0024) |
| `packages/web-session` | `SessionStore` | Redis store | in-memory store | the same store contract tests for both (`tests/store-contract.ts`) | none |

The notification service sends through an `INotificationSender` adapter; only a logging sender exists (no real provider). Auth, secrets and payments are deliberately outside this pattern (ADR-0005, 0006, 0007). The Event Grid transport is not built.

**Verification caveat.** The Redis and Cosmos adapter tests read a connection string and some fall back to fakes when the dependency is not running, so a green run without Docker does not prove the real adapter works (register items 31, 35). With the Cosmos emulator and Redis both up, the ordering tests ran 522 passed and 0 skipped on 2026-11-07.

### Two meanings of "fallback"

"Local fallback" is used in the ADRs for two separate decisions. Keep them apart.

- **Axis A, the environment target.** Which concrete implementation backs an interface *in a given environment*, chosen when the environment is configured. A local implementation is one value of this choice, not a fallback from anything. The reasons are specific and should be stated, not applied by reflex: cost avoided in development, working offline, matching an ephemeral CI environment, or because no cloud equivalent can run there (the cloud event transport cannot run on a laptop, ADR-0003).
- **Axis B, the fallback chain.** An ordered sequence of implementations used *at run time, inside an environment that is already running*, each tier entered on a trigger (a failure or a staleness limit) and optionally with a policy (retries, how stale is acceptable, coalescing requests so a tier is not stampeded). It is deliberate resilience: graceful degradation and recovery of the primary. It is not inherently local; a tier can be another remote service.

The two usually point the same way in a small project (the cheap local option is both the development target and the last-resort fallback), which is why they read as one thing. They are justified independently and do not have to line up.

| Interface | Axis A: target per environment | Axis B: fallback chain at run time |
|---|---|---|
| Cache (`ICacheProvider`) | `Cache:Backend`: `local` (in process) by default; `redis` where enabled (the `with-redis` profile locally; managed Redis in staging and production, ADR-0002). The catalog stops on any other value | One tier: `ResilientCacheProvider` trips a circuit breaker on primary failure and serves from the local provider, with a warning and a recovery probe. No retry, staleness or coalescing policy; the entry's TTL is the staleness limit |
| Events (`IEventPublisher`) | Redis Streams locally; Event Grid in the cloud (not built); an in-memory transport for tests and throwaway runs, chosen explicitly by `Events:Backend` | None. Durable recovery is a different mechanism (the outbox and relay recover the primary; they are not a lower tier), and a handler that keeps failing is dead-lettered |
| Data (`IRepository<T>`) | A fake for fast unit tests, the Cosmos emulator for integration, Cosmos when deployed (`Data:Backend`) | None, and there must not be one: a deployed service never silently switches to a fake |
| Identity | The mock issuer locally; Entra when configured (an authority and audience swap) | None; authentication has no degraded mode |
| Payments | A named stub today (saved payment methods are seed data and the stub judges their token); Stripe later | None |
| Live vendor queue | The push stream (ADR-0021) | Polling, which stays: when the stream fails the screen says "Polling" and keeps working (section 9) |

**Why it matters: a recurring defect is Axis A behaving like Axis B.** Some adapter tests choose a fake when the real dependency is not reachable, and report green (register items 31 and 35). That is a target selected by availability, with no signal, instead of by configuration. The pattern that fixes it: **Axis A is chosen explicitly and fails loudly** (the services refuse to start without `Events:Backend`, and the catalog's silent fallback to the in-memory transport was removed on 2026-10-28, register item 73); **Axis B is the only place a substitution at run time is acceptable**, and even there it logs, is bounded and is tested with a chaos decorator. When an ADR or a checklist says "fallback", it should say which axis, and for Axis A state the reason (cost, offline, CI parity or no cloud equivalent).

## 2. Fail visibly on configuration

A service refuses to start rather than guess. `ordering-service`, `catalog-service` and `notification-service` stop unless `Events:Backend` is `redis` or `inmemory`, so events are never dropped silently; `catalog-service` stops unless `Cache:Backend` is `local` or `redis`; `ordering-service` stops if `Pickup:TimeZoneId` is unknown. Test hooks are gated the same way: `ENABLE_TEST_HOOKS` (which now only lets the web app's mock-backed browser tests pick fixtures) must never be set outside tests. There is no payment hook any more: a declined payment is a saved payment method whose token fails ordering's token rule (`WI-ORD-010`). The exception to the rule is the telemetry exporter, which can drop spans silently (register 82). The one deliberate softness is the cache Redis: with `Cache:Backend=redis` the catalog starts even if the cache Redis is not up yet, because the resilient provider serves from the local tier (an Axis B behaviour, not a silent target change).

## 3. Outbox with inline publish and a relay

Raised domain events are stored inside the order document in the same write as the state change. Checkout then publishes them inline, waiting at most `InlinePublishTimeoutSeconds` (2 s) and leaving anything unsent for `OutboxRelay`, which sweeps every few seconds (5 s, backing off to 60 s when idle), skipping events newer than a 3 s grace period. A crashed instance's events wait at most the idle ceiling. Event ids are deterministic, so a double publish is harmless: consumers dedupe on `eventId` (ADR-0003). Applied in `ordering-service` (`WI-ORD-005`) and, since 2026-11-01, in `catalog-service` for `ListingPublished` and `LowStockDetected` (`ListingEventPublisher`, `ListingOutboxRelay`; register 30). Known limits: one stuck entry blocks that order's later events (74), the relay is not leased across instances (72), streams are never trimmed (75).

## 4. Idempotent writes with a derived id

Checkout derives the order id from `(customerId, idempotency key)` and stores a hash of the request. A repeat of the same request returns the original order (200); the same key with a different request is `422 idempotency_key_reuse`. The create-only write decides a race, so twelve simultaneous identical submits made one order on the real stack. A rejected checkout **spends** its key: the web client takes a new one (the catalog will not reserve again for a released order id, register 81).

## 5. Reserve and release with a final released state

The catalog owns the stock counter (ADR-0017). A reservation is one atomic batch per vendor, keyed by the order id; repeating it is idempotent, a different request under the same order id is refused, and a **released reservation is final**, so a late duplicate cannot hold stock for a dead order. Ordering releases on a declined payment, a failed save, and a vendor decline or cancel. Reservation records are never cleaned up (register 66).

## 6. Optimistic concurrency

Entities that implement `IETagged` are saved with `SaveIfUnchangedAsync` (Cosmos If-Match). Listings use it; orders write through `OrderStore.TryUpdateAsync`. The vendor status document is still last-write-wins (register 30).

## 7. Cache-aside on source data, with invalidation and a single flight

The catalog's `ListingCache` (`WI-CAT-003`, ADR-0002 and ADR-0014 layer 1) caches the **source data** that every browse reads, not a response: the ids of the verified vendors, and each vendor's published listings, for 60 seconds by default (`ListingCache:TtlSeconds`; 0 turns it off). Nothing in it is per customer: personalization is worked out after the read, so a customer's allergens never reach the cache. The vendor's own reads never use it.

- **Invalidation.** An entry is deleted when a listing is created or edited, when a reserve, release or stock adjustment **changes the listing's status** (a sale that keeps the status invalidates nothing; the cached quantity drifts, which is safe because customers see a status and checkout's atomic reservation decides, ADR-0017), and when a vendor's verification changes. A failed invalidation is logged and the entry lives until its TTL, the staleness limit ADR-0002 accepts.
- **Single flight.** When an entry is missing, the first miss starts the one load and the others wait for its result. The load belongs to all of them, so a caller that cancels only stops waiting; it has its own timeout; a failed load is not kept and the next call tries again. An invalidation bumps the key's generation and drops the load in flight, so a load that began before a write cannot put its old result in the cache.
- **A cache failure never fails a read** and never skips a filter: the load function is the one a miss uses.
- **Limits, stated in the spec:** stampede protection and invalidation are per process (replicas each load once; an invalidation reaches only its own replica, bounded by the TTL); one entry per vendor holds the whole list.
- **Measured** on the seeded catalog, three runs each, one machine: the BFF listings query p50 about 20 ms without the cache and about 3 ms with it, the server-rendered home page about 24 ms and about 8 ms; checkout did not change (`docs/evidence/WI-CAT-003/after-2026-11-07.md`). In-process provider only.

`ordering-service` also holds a small per-instance cache of listing and modifier names (`ListingNameCache`, register 113) so the vendor's order view does not read the catalog per order. The per-layer record for the listing path (server, Relay store, HTTP) is in `WI-PORT-004`.

## 8. A strategy behind events only

The fulfillment seam (ADR-0001) is kept by construction, not by convention. `PickupFulfillment` is a separate event consumer inside ordering-service with its own consumer group, through an optional `consumerName` on `IEventSubscriber.SubscribeAsync` and `SubscribeBatchAsync`. It reacts to the order's events and raises its own (`PickupWindowScheduled`, `OrderReadyForPickup`); the vendor's "Handed over" answers `202` (through `OrderFulfillmentConfirmationRequested`) and the order completes when `OrderFulfillmentCompleted` arrives. The Ordering core has no reference to the strategy, and a reflection test fails if it gains one. A delivery strategy would replace it by subscribing to the same events (`WI-ORD-003`, In review).

## 9. Push as a nudge, polling as the floor

The vendor's queue screen asks for its orders by polling, and a stream layered on top tells it when to ask sooner (ADR-0021): a GraphQL subscription over server-sent events, with Redis Pub/Sub fan-out between ordering instances. The push carries no data the poll does not, so losing it costs only latency: when the stream fails the screen shows "Polling" and carries on, and after each reopen it reads the list again so nothing that happened while it was away is missed. Ordering keeps five streams per vendor and ends the oldest when a sixth opens. The customer's order page polls (`WI-CUST-010`).

Shown by the browser suites, the real-stack journeys and a 66-minute run with five open streams, one order every 5 seconds and an ordering restart at the midpoint: 762 orders, none missed by any screen (`docs/evidence/WI-SEC-005/load-soak-2026-11-03.md`).

## 10. Limits per caller

The web apps limit requests per address and per login, and the BFF holds a coarse backstop that counts per client when the web app is the caller (the web app forwards the client's address and the BFF believes it only from addresses it trusts, `BFF_TRUSTED_CLIENT_SOURCES`; register 137), so one abusive client cannot use up the allowance of every user. The BFF also limits the size of a GraphQL operation and the web apps send browser hardening headers (`WI-RATE-001`, `WI-SEC-005`; `docs/architecture/threat-model.md`). Shown with a control run: with the shared counter, 51 of 54 orders outside an outage were refused; with per-client counting none were (`docs/evidence/WI-SEC-005/client-address-load-2026-11-07.md`).

## 11. The BFF is composition and error mapping only

The GraphQL BFF forwards the caller's token unchanged, forwards `traceparent`, maps service error codes to typed payloads (`PlaceOrderRejected` and its codes), and turns any other failure into a generic error that carries the trace id while the detail is logged. It holds no business rules, prices or state (ADR-0013). `placeOrder` is one downstream call.

## 12. Zero-trust validation and service tokens

Every service validates the token and ownership itself, even behind a gateway (ADR-0006, ADR-0008). Service callers use a client-credentials token with an app role, validated like any other (ADR-0018). The gateway's check is only a fast fail. Browsers never hold a token: a server-side session behind an HttpOnly cookie (ADR-0019); the Android app keeps its refresh token in the Keystore (ADR-0023).

## 13. How things are verified

| Technique | Where | Example |
|---|---|---|
| Shared contract tests | the libraries and the session store above | every transport, repository, cache and session store inherits one suite |
| Real-stack journeys | `apps/web-customer/tests/skeleton`, `scripts/ci/skeleton-smoke.mjs` | 62 of 62 against the real services and issuer on 2026-11-07 (`WI-ORD-003`) |
| Mock-backed browser tests | `apps/web-customer/tests/e2e`, `apps/web-queue-display` | the customer app's suite repeated 10 times: 620 executions, 0 failures; run in Chromium, Firefox and WebKit |
| Android flows | `apps/mobile-customer/.maestro` | fifteen Maestro flows on an emulator, run locally |
| Generated-input tests | the BFF and the session package | a fixed seed; each property shown able to fail (`docs/evidence/WI-SEC-005/fuzz-2026-11-02.md`) |
| Load and soak | `scripts/dev/load-test.mjs` | the 66-minute run above |
| Dynamic scan | `scripts/ci/zap-scan.mjs` | OWASP ZAP over both web apps and the BFF: no high finding |
| Mutation checks | by hand, recorded in outcome notes | a sample of 10 in the baseline: 9 killed, 1 survived (register 85); each cache invalidation rule was broken on purpose and the intended tests failed |
| Linux container run | `scripts/ci/linux-check.mjs` | the development machine is Windows, the pipeline is Ubuntu |
| Trace data-safety scan | `docs/evidence/slice-1/findings.md` | no token, key or secret in any exported span |

## 14. Behaviour when a dependency fails

How each row was established is stated, because "designed to" and "shown to" differ.

| When this fails | What happens | Established by |
|---|---|---|
| Redis cache (primary), where `Cache:Backend=redis` | `ResilientCacheProvider` trips a circuit breaker, serves from an in-process cache on that instance, logs a warning, and probes to recover. Instances do not share the fallback. A read never fails because the cache did | unit tests with the chaos provider; the catalog starting with the cache Redis unreachable (a test, `WI-CAT-003`); not exercised against a real Redis outage under load |
| Redis Streams during checkout | the order is stored with its events; the inline publish gives up after 2 s and the relay sends them later; the customer still gets the order | real-stack run with a Redis outage and recovery (`WI-ORD-005`, `docs/evidence/runbook-event-broker-2026-10-30.md`); a test that a slow broker delays checkout no longer than the timeout |
| Ordering restarts while customers and vendors are using it | for 19 s in the soak: 154 reads and 4 order placements failed with a generic error, none outside that window; every vendor screen reopened and caught up and no order was missed | the 66-minute run, one restart |
| The live stream fails | the vendor's screen says "Polling" and keeps working at the poll interval | the queue display's browser tests and the stream-path record (`docs/evidence/WI-QUE-003/`); the stream-limit and restart parts of the soak |
| Catalog during checkout | ordering cannot price or reserve and answers `503 downstream_unavailable`; the BFF has no typed code for it, so the customer sees a generic error with a trace reference (register 165) | read in code; ordering's call timeout is 5 s; the BFF's timeout is tested against a stub that never answers; not run against a stopped catalog |
| Not enough stock | `409 insufficient_stock` with the quantity left; the web page offers it | real-stack journey |
| Payment declined (a saved method whose token fails ordering's rule) | nothing is reserved and the answer is `402`; no order is stored, the customer's cart is kept, and the web client uses a new key | real-stack journey |
| The BFF or a service is slow | the BFF times out reads at 5 s and checkout at 15 s; ordering's call to the catalog at 5 s | configuration and a BFF test with a downstream that never answers (timeouts of 300 ms); the 15 s limit was met by the 4.7 s cold checkout |
| A caller sends too much | `RATE_LIMITED`; counted per client | browser and unit tests; the two load runs above |
| Issuer cold or unreachable (web) | the first request on a cold stack waits about 2 s twice (metadata, then a service token) | measured in the trace; behaviour with the issuer down is not examined (register 166) |
| Issuer returns a server error on refresh (Android) | the app treats it as an outage and keeps its refresh token, so the customer is not signed out by it (register 151) | unit tests and a Maestro flow that restarts the issuer |
| Cosmos | an outage is not examined; the adapters pass against the vNext emulator | the emulator-gated tests (register 166) |
| Telemetry endpoint | spans are lost, and a missing protocol setting loses them silently (register 82) | observed in the first capture |
| A malformed event on a stream | acknowledged and dropped without dead-lettering (register 88) | read in code |

## 15. Where each technique is applied, and what it is tested against

The table the review asked for (register item 89): where the technique is in the code, and whether its tests meet the real dependency or a fake.

| Technique | Applied in | Tested against the real dependency | Against a fake only |
|---|---|---|---|
| Cache adapter with fallback | catalog `ListingCache`; notification contacts; ordering's per-instance name cache | the Redis provider's contract tests on Redis (the pipeline asserts the Redis tests reached Redis); the catalog's Redis round trip (skipped without Redis) | the breaker and the fallback tier (the chaos provider) |
| Invalidation and single flight | catalog `ListingCache` | with a counted store and mutation checks on each rule | several replicas |
| Repository adapter | all three services | Cosmos emulator tests, run by hand or with the connection string set (CI does not run the emulator, register 65) | the default unit and service tests |
| Event transport, outbox and relay | ordering outbox; consumers in catalog, ordering and notification | Redis Streams contract tests on Redis in CI; the broker outage run; the ordering restart | a malformed entry (register 88) |
| Idempotent write, reserve and release, optimistic concurrency | ordering, catalog | real-stack journeys, including twelve simultaneous identical submits | |
| Fail visibly on configuration | `Events:Backend`, `Cache:Backend`, `Pickup:TimeZoneId`, test hooks | the catalog's event-backend test; the others read in code | |
| Timeouts | BFF 5 s and 15 s; ordering to catalog 5 s; inline publish 2 s; stream write 10 s | the cold checkout inside 15 s; a slow broker | the BFF's timeout against a stub that never answers; a slow payment (register 92) |
| Push with polling | the queue display, the BFF subscription, ordering's stream endpoint | the 66-minute run, the real-stack journeys | |
| Limits per caller | both web apps, the BFF | two load runs | |

## 16. What the review found (register item 89, 2026-11-08)

- **The guidance matched the code in most places.** The stale parts were the cache ("no service uses the cache yet": the catalog does), the number of journeys and tests, and the lack of patterns for the listing cache, the strategy as a consumer and push with polling (sections 7 to 10).
- **Gaps, each in the register:** the catalog's failure during checkout has no typed code in the BFF (165); the failure of the issuer, Cosmos and the cache Redis has not been exercised against the real dependency (166). The older items stand: a malformed event is dropped without dead-lettering (88), a stuck outbox entry blocks later events of that order (74), the relay is not leased (72), the adapter tests that choose fakes by availability (31, 35), a slow payment (92).
- **Recommended, not changed (the lead's call):** the cache fallback keeps no retry or staleness policy of its own beyond the TTL, and the single flight covers coalescing for the listing cache. That is enough for a read-through cache of data that may be a minute old; revisit when a service caches data that may not.
