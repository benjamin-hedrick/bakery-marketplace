# Chaos scenarios

Seeded, configured fault injection at the interfaces the system already has (ADR-0024, `docs/architecture/chaos-scenarios-proposal.md`). A scenario is a JSON file here; a running process switches it on with configuration; nothing in the service's own code changes.

## Run a service with a scenario

```
Chaos__Enabled=true Chaos__Scenario=flaky-broker dotnet run --project services/ordering-service/src
CHAOS_ENABLED=true CHAOS_SCENARIO=bff-door DEPLOYMENT_ENVIRONMENT=local node services/graphql-bff/src/main.ts
```

The Node processes (the BFF) use `CHAOS_ENABLED`, `CHAOS_SCENARIO` and `DEPLOYMENT_ENVIRONMENT` (`local` or `dev`; `NODE_ENV` of `development` or `test` also counts, because the container image sets `NODE_ENV=production` everywhere and an unset `NODE_ENV` on a real host is not permission). They refuse to start with chaos on anywhere else.

`Chaos__Scenario` is a name (this folder's `scenarios/<name>.json`, found by walking up from the app) or a path. The service logs one warning naming the scenario and the seed, every response carries `X-Chaos-Scenario`, and `X-Chaos-Injected` lists the faults injected while that response was produced. Chaos is refused at startup unless the host is `Development` or `Deployment__Environment=dev`.

## Scenario format

```json
{ "name": "flaky-broker", "seed": 20261109, "layers": { "events": { "publishFailureRate": 0.3, "duplicateRate": 0.2 } } }
```

Settings ending in `Rate` are probabilities from 0 to 1; the others are non-negative numbers (the unit is in the name). A mistake in a name or a value stops the host at startup.

| Layer | Wraps | Settings |
|---|---|---|
| `events` | `IEventPublisher`, `IEventSubscriber` | `publishFailureRate`, `publishLostResponseRate`, `dropRate`, `duplicateRate`, `reorderRate`, `handlerFailureRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `cache` | the primary cache store, under `ResilientCacheProvider` | `failureRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `repository` | every `IRepository<T>` and the `IBatchFactory` | `failureRate` (a Cosmos 503), `lostResponseRate` (the write is made, then a 408), `conflictRate` (a conditional save or batch loses its concurrency check), `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `broadcast` | `IBroadcastPublisher`, `IBroadcastSubscriber` (the live vendor screens' nudge) | `failureRate`, `dropRate`, `deliveryDropRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `payment` | ordering's `IPaymentProcessor` | `failureRate` (the processor throws), `lostResponseRate` (authorized, then a timeout), `declineRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `catalog` | ordering's `ICatalogGateway` | `unavailableRate` (the `DownstreamUnavailableException` a dead catalog gives), `lostResponseRate`, `rejectRate` (a refused reservation), `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `notification` | the notification service's `INotificationSender` | `failureRate`, `lostResponseRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `bff` | the GraphQL BFF's door (a gate before the body is read; `/healthz` is never touched) | `rejectRate` and `rejectStatus` (400 to 599, default 503), `malformedRate` (a 200 that is not JSON), `resetRate` (the connection is closed), `hangRate` (no answer), `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |
| `web` | the web servers' GraphQL routes (`/api/graphql` and `/api/graphql-stream` of the customer app and the queue display; a gate before the rate limits, the CSRF checks and the session) | the same settings as `bff`; the error is `{ "error": ... }` as the proxy's own answers are; the response names the scenario and the injected fault (`X-Chaos-Scenario`, `X-Chaos-Injected`). Switched on by `CHAOS_ENABLED=true CHAOS_SCENARIO=web-door DEPLOYMENT_ENVIRONMENT=local` on the Next.js server, where `chaos/scenarios` is found upward from the working directory |
| `bffCatalog`, `bffOrdering` | the BFF's two service clients | `failFirstAttempts` (a whole number: the first N attempts of each operation and key fail, then the retry goes through), `unavailableRate` (fails as an unreachable service does), `serverErrorRate` (a 5xx), `malformedRate` (a body that is not JSON), `lostResponseRate`, `latencyMs`, `outageFromSeconds`, `outageWindowSeconds` |

`lostResponseRate` is the ambiguous failure: the operation **succeeds** and the caller is then told it timed out (a payment authorized, an order stored, a message sent, a stock reservation made). Whatever retries must be idempotent. The events layer's equivalent is `publishLostResponseRate`: the event is delivered and the publisher is told it failed, so the outbox publishes it again.

One scenario file serves a whole stack. A process applies the layers it has an interface for and logs, once it is up, which layers it applied and which the scenario names but it does not have (the admin service has no event transport; notification has no payment processor). A layer name that no process knows fails when the scenario is loaded. Outage windows are measured from the process's chaos start. Scenarios: `flaky-broker`, `broker-outage`, `slow-cache`, `checkout-trouble`, `bff-door`. `layers.json` is the shared list of layers and settings; the C# and TypeScript libraries each test their copy against it. Not built yet: a scenario run on the whole real stack with evidence, and the web apps' server-side proxies (register 169).

## Aiming a fault, and signals (ADR-0024 amendment, 2026-11-10; the Node processes apply them, the C# library only checks them)

Three optional sections next to `layers`:

```json
{
  "name": "mobile-flows", "seed": 20261110,
  "layers": { "bffOrdering": { "failFirstAttempts": 1 } },
  "where": { "bffOrdering": [ { "operation": "placeOrder", "payload": { "paymentMethodId": "pm-alice-ok", "lineItems": [ { "listingId": "listing-latte-001", "quantity": 2 } ] } } ] },
  "off": [],
  "signals": [ { "when": { "client": "bffCatalog", "operation": "get", "key": "listing-x" }, "do": "enable", "layer": "bffOrdering" } ]
}
```

- `where`: per layer, a list of matches; the layer disturbs only calls that match one of them (a layer with no `where` disturbs every call). A match has `operation` (the client method), `customer` (the `sub` of the bearer token, read and not verified), `key` (the call's first non-credential string: an id, an idempotency key), `payload` (a pattern the call's first object or array argument must contain: scalars equal, objects with at least those properties, arrays of the same length element by element) and, in signals, `client` (`bffCatalog` or `bffOrdering`).
- `off`: layers that start switched off.
- `signals`: a normal request that matches `when` runs `do`: `enable` or `disable` a `layer`, `switch` to the scenario file called `scenario` (a plain name, never a path), or `reset` (counters and clock again, layers as the scenario starts them). A request carries no setting and names no scenario; the matched request goes on as normal, judged after the signal; each signal is in the journal as `signal:<what>`.

`mobile-flows` is the scenario the Android flows' runner gives the BFF (`node scripts/dev/mobile-flows.mjs`): it fails the first attempt of the one order flow 11 places.

## The decision function

Whether a fault applies to an operation does not depend on call order or threads. It is the first 8 bytes of SHA-256 over `"{seed}|{layer}|{fault}|{key}"` (UTF-8), read big-endian as an unsigned integer, with the low 11 bits dropped and the rest divided by 2^53, a value in [0, 1) compared with the rate. The key is the operation's own identity (the event id, an order id, plus the attempt number for failures, so a retry is judged afresh). At the BFF's door the key is the trace id of the request when the caller sets its own `traceparent` (so a test chooses which requests are hit), otherwise the request's number. `test-vectors.json` holds expected numbers computed independently of the C# code; every implementation's tests must reproduce them.

## Writing a test

Name the scenario, assert from the journal that the fault happened, then assert the system coped. A survival assertion alone passes with chaos off.

```csharp
var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("outage", 1, "events", ("outageWindowSeconds", 1.5)));
// ... exercise the system ...
Assert.True(runtime.Journal.Count("events", "outage") >= 1);
```

Host tests set `Chaos:Enabled` and `Chaos:Scenario` as configuration (see `ChaosHostTests` in the ordering tests).
