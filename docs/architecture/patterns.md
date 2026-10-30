# Patterns used in this repository

> **Status:** Current · written 2026-10-30 from the code, the ADRs and the evidence records. For each pattern: what it is, where it is applied, and how it is verified. Behaviour under failure is in the last section, with how each row was established. This page is the starting point for the cache, fallback and resilience review recorded as register item 89; it has not done that review.

## 1. Adapter, fallback and contract tests (and a chaos decorator where resilience matters)

An interface, a real implementation and a local or fake one, a shared abstract contract-test base that every implementation inherits, and a chaos decorator that injects failure. New infrastructure code follows it (`CLAUDE.md`).

| Library | Interface | Real | Local or fake | Contract tests | Chaos |
|---|---|---|---|---|---|
| `tools/BakeryMarketplace.Caching` | `ICacheProvider` | Redis provider | `LocalCacheProvider` (`IMemoryCache`) | `CacheProviderContractTests` | `ChaosCacheProvider`, and `ResilientCacheProvider` as the circuit-breaking fallback |
| `tools/BakeryMarketplace.Data` | `IRepository<T>` | `CosmosRepository<T>` | fake repository | `RepositoryContractTests`, `BatchContractTests`, `ConcurrencyContractTests` | none |
| `tools/BakeryMarketplace.Eventing` | `IEventPublisher`, `IEventSubscriber` | Redis Streams transport | in-memory transport | `EventTransportContractTests` | not built (`EVT-004`) |

Auth, secrets and payments are deliberately outside this pattern (ADR-0005, 0006, 0007). The Event Grid transport is not built.

**Verification caveat.** The Redis and Cosmos adapter tests read a connection string and some fall back to fakes when the dependency is not running, so a green run without Docker does not prove the real adapter works (register items 31, 35). The Data test project skips 15 tests without an emulator.

### Two meanings of "fallback"

"Local fallback" is used in the ADRs for two separate decisions. Keep them apart.

- **Axis A, the environment target.** Which concrete implementation backs an interface *in a given environment*, chosen when the environment is configured. A local implementation is one value of this choice, not a fallback from anything. The reasons are specific and should be stated, not applied by reflex: cost avoided in development, working offline, matching an ephemeral CI environment, or because no cloud equivalent can run there (the cloud event transport cannot run on a laptop, ADR-0003).
- **Axis B, the fallback chain.** An ordered sequence of implementations used *at run time, inside an environment that is already running*, each tier entered on a trigger (a failure or a staleness limit) and optionally with a policy (retries, how stale is acceptable, coalescing requests so a tier is not stampeded). It is deliberate resilience: graceful degradation and recovery of the primary. It is not inherently local; a tier can be another remote service.

The two usually point the same way in a small project (the cheap local option is both the development target and the last-resort fallback), which is why they read as one thing. They are justified independently and do not have to line up.

| Interface | Axis A: target per environment | Axis B: fallback chain at run time |
|---|---|---|
| Cache (`ICacheProvider`) | `CACHE_BACKEND`: in-process local provider by default in development; Redis where enabled (the `with-redis` profile locally; managed Redis in staging and production, ADR-0002) | One tier: `ResilientCacheProvider` trips a circuit breaker on primary failure and serves from the local provider, with a warning and a recovery probe. No retry, staleness or coalescing policy |
| Events (`IEventPublisher`) | Redis Streams locally; Event Grid in the cloud (not built); an in-memory transport for tests and throwaway runs, chosen explicitly by `Events:Backend` | None. Durable recovery is a different mechanism (the outbox and relay recover the primary; they are not a lower tier), and a handler that keeps failing is dead-lettered |
| Data (`IRepository<T>`) | A fake for fast unit tests, the Cosmos emulator for integration, Cosmos when deployed | None, and there must not be one: a deployed service never silently switches to a fake |
| Identity | The mock issuer locally; Entra when configured (an authority and audience swap) | None; authentication has no degraded mode |
| Payments | A named stub today; Stripe later | None |

**Why it matters: a recurring defect is Axis A behaving like Axis B.** Some adapter tests choose a fake when the real dependency is not reachable, and report green (register items 31 and 35). That is a target selected by availability, with no signal, instead of by configuration. The pattern that fixes it: **Axis A is chosen explicitly and fails loudly** (the services refuse to start without `Events:Backend`, and the catalog's silent fallback to the in-memory transport was removed on 2026-10-28, register item 73); **Axis B is the only place a substitution at run time is acceptable**, and even there it logs, is bounded and is tested with a chaos decorator. When an ADR or a checklist says "fallback", it should say which axis, and for Axis A state the reason (cost, offline, CI parity or no cloud equivalent).

## 2. Fail visibly on configuration

A service refuses to start rather than guess. `ordering-service` and `catalog-service` stop unless `Events:Backend` is `redis` or `inmemory`, so events are never dropped silently; `ordering-service` stops if `Pickup:TimeZoneId` is unknown. Test hooks are gated the same way: the `X-Test-Payment` header is ignored (and logged) in Production, and the BFF forwards the declined-payment hook only when `ENABLE_TEST_HOOKS` is set, which must never be set outside tests. The exception to the rule is the telemetry exporter, which can drop spans silently (register 82).

## 3. Outbox with inline publish and a relay

Raised domain events are stored inside the order document in the same write as the state change. Checkout then publishes them inline, waiting at most `InlinePublishTimeoutSeconds` (2 s) and leaving anything unsent for `OutboxRelay`, which sweeps every few seconds (5 s, backing off to 60 s when idle), skipping events newer than a 3 s grace period. A crashed instance's events wait at most the idle ceiling. Event ids are deterministic, so a double publish is harmless: consumers dedupe on `eventId` (ADR-0003). Applied in `ordering-service` (`WI-ORD-005`); the catalog has no outbox (register 30). Known limits: one stuck entry blocks that order's later events (74), the relay is not leased across instances (72), streams are never trimmed (75).

## 4. Idempotent writes with a derived id

Checkout derives the order id from `(customerId, idempotency key)` and stores a hash of the request. A repeat of the same request returns the original order (200); the same key with a different request is `422 idempotency_key_reuse`. The create-only write decides a race, so twelve simultaneous identical submits made one order on the real stack. A rejected checkout **spends** its key: the web client takes a new one (the catalog will not reserve again for a released order id, register 81).

## 5. Reserve and release with a final released state

The catalog owns the stock counter (ADR-0017). A reservation is one atomic batch per vendor, keyed by the order id; repeating it is idempotent, a different request under the same order id is refused, and a **released reservation is final**, so a late duplicate cannot hold stock for a dead order. Ordering releases on a declined payment, a failed save, and a vendor decline or cancel. Reservation records are never cleaned up (register 66).

## 6. Optimistic concurrency

Entities that implement `IETagged` are saved with `SaveIfUnchangedAsync` (Cosmos If-Match). Listings use it; orders write through `OrderStore.TryUpdateAsync`. Other documents are still last-write-wins (register 30).

## 7. The BFF is composition and error mapping only

The GraphQL BFF forwards the caller's token unchanged, forwards `traceparent`, maps service error codes to typed payloads (`PlaceOrderRejected` and its codes), and turns any other failure into a generic error that carries the trace id while the detail is logged. It holds no business rules, prices or state (ADR-0013). `placeOrder` is one downstream call.

## 8. Zero-trust validation and service tokens

Every service validates the token and ownership itself, even behind a gateway (ADR-0006, ADR-0008). Service callers use a client-credentials token with an app role, validated like any other (ADR-0018). The gateway's check is only a fast fail.

## 9. How things are verified

| Technique | Where | Example |
|---|---|---|
| Shared contract tests | the three libraries above | every transport and repository inherits one suite |
| Real-stack journeys | `apps/web-customer/tests/skeleton`, `scripts/ci/skeleton-smoke.mjs` | 21 journeys against the real services and issuer |
| Mock-backed browser tests | `apps/web-customer/tests/e2e` | 57 tests, repeated 10 times with no failure (`62-evidence-baseline`) |
| Mutation checks | by hand, recorded in outcome notes | a sample of 10 in the baseline: 9 killed, 1 survived (register 85) |
| Linux container run | `scripts/ci/linux-check.mjs` | the development machine is Windows, the pipeline is Ubuntu |
| Trace data-safety scan | `docs/evidence/slice-1/findings.md` | no token, key or secret in any exported span |

## 10. Behaviour when a dependency fails

How each row was established is stated, because "designed to" and "shown to" differ.

| When this fails | What happens | Established by |
|---|---|---|
| Redis cache (primary) | `ResilientCacheProvider` trips a circuit breaker, serves from an in-process cache on that instance, logs a warning, and probes to recover. Instances do not share the fallback. No service uses the cache yet | unit tests with the chaos provider; not exercised against a real Redis outage |
| Redis Streams during checkout | the order is stored with its events; the inline publish gives up after 2 s and the relay sends them later; the customer still gets the order | real-stack run with a Redis outage and recovery (`WI-ORD-005`) |
| Catalog during checkout | ordering cannot price or reserve, answers `503 downstream_unavailable`; the BFF has no typed code for it, so the customer sees a generic error with a trace reference | read in code; ordering's call timeout is 5 s; not run as a failure test |
| Not enough stock | `409 insufficient_stock` with the quantity left; the web page offers it | real-stack journey |
| Payment declined (test hook) | the reservation is released and the answer is `402`; no order is stored, the customer's cart is kept, and the web client uses a new key | real-stack journey |
| The BFF or a service is slow | the BFF times out reads at 5 s and checkout at 15 s | configuration; the 15 s limit was met by the 4.7 s cold checkout |
| Issuer cold or unreachable | the first request on a cold stack waits about 2 s twice (metadata, then a service token) | measured in the trace; behaviour with the issuer down is not examined |
| Cosmos | not examined here | |
| Telemetry endpoint | spans are lost, and a missing protocol setting loses them silently (register 82) | observed in the first capture |
| A malformed event on a stream | acknowledged and dropped without dead-lettering (register 88) | read in code |

## Open questions for the review (register item 89)

- Which of these behaviours are tested against the real dependency, and which only against a fake.
- Whether the cache fallback's per-instance behaviour is acceptable once a service uses the cache.
- Whether failure of the catalog during checkout should get a typed code in the BFF.
- Whether the silent fallbacks to fakes (items 31, 35) should become explicit failures when the real dependency is expected (they are Axis A behaving like Axis B; see "Two meanings of fallback").
- Whether the cache fallback needs the policy an Axis B tier can carry (retries, staleness limit, request coalescing); today it has none.
- A slow payment is untested because the stub answers instantly; a variable delay is wanted (item 92).
