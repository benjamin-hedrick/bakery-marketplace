# WI-QUE-003 on the real local stack: the live queue and its measured delay

> **Status:** Done for the local stack · run by the AI agent on 2026-11-02 on a developer machine (Windows 11, Docker Desktop with Compose, .NET 10, Node 25.9.0), with `node scripts/ci/skeleton-smoke.mjs` on the working tree that became commit `6168f9f` (one logger category name in ordering was corrected after the run; nothing else changed). Nothing is deployed and no browser other than Playwright's Chromium was used.

## What was run

`scripts/ci/skeleton-smoke.mjs` brings up the real local stack: Redis (events), the Cosmos emulator and the mock OIDC issuer in Compose, the cache Redis for sessions, then the catalog service, the ordering service, the GraphQL BFF and the two web apps as host processes (the customer app on 3000, the vendor's queue display on 3100), seeds it, runs the Playwright journeys in `apps/web-customer/tests/skeleton/` and tears it down. The two new journeys are in `vendor-live.spec.ts`:

1. **The vendor screen is Live and an order and each action on it arrive by push.** A vendor logs in to the queue display through the real issuer, and the screen says **Live** (the stream is established). A customer places an order through the BFF; its card is on the screen **168 ms after the request was sent** (a poll could take up to a minute while the screen is live). The vendor then confirms, starts preparation, marks ready and completes the order through ordering's REST API with the vendor's own token: the card moves to Preparing, stays, moves to Ready and leaves the screen, each within the test's 8-second allowance, and the screen still says Live at the end.
2. **The delay, over 20 orders.** The same screen with `?delay=1`; each order placed in turn; the moment each card first appears is stamped inside the page by a mutation observer, so the figures contain no polling by the test.

| Delay in milliseconds | n | min | p50 | p95 | max |
|---|---|---|---|---|---|
| From the request being sent to the card being on the screen | 20 | 69 | 94 | 129 | 140 |
| From the answer reaching the customer to the card being on the screen | 20 | 6 | 29 | 57 | 70 |
| From the event's time (set by ordering) to the screen, as the screen reports it | 20 | 44 | 68 | 99 | 112 |

Raw output of the run:

```
[live] order visible 168 ms after the request was sent
[live-delay] {"orders":20,"requestToScreenMs":{"n":20,"min":69,"p50":94,"p95":129,"max":140},"responseToScreenMs":{"n":20,"min":6,"p50":29,"p95":57,"max":70},"eventToScreenMs":{"n":20,"min":44,"p50":68,"p95":99,"max":112}}
25 passed (26.5s)
[skeleton] Playwright exit code 0
```

The 25 are the 23 earlier journeys (customer journeys, login, issuer, the stack checks, the vendor queue) and these two. The chain each change travelled: ordering's outbox, the Redis event stream, ordering's own subscriber, the vendor read model in Cosmos, Redis Pub/Sub, ordering's event stream, the BFF's subscription, the queue display's server (where the session's token is attached) and the browser. The test asserts `p95 of the event-to-screen delay < 3000 ms` and `max of response-to-screen < 7000 ms`: the old design waited for the next poll, up to 7 seconds and 3.5 on average, so the push must beat the worst case of that with a margin. Measured, it is about two orders of magnitude inside it.

## How to read the numbers

- One machine, so no network latency between the parts and no clock difference between "server" and "screen"; a deployed environment will add hops (ingress, API Management) and the figures will be larger. API Management and Container Apps ingress are **not** in this run, and neither is their handling of a streamed response (ADR-0021 decision 4: to be checked when a cloud path is built).
- Twenty orders placed one after another with 150 ms between them is a light load, not a load test.
- The Cosmos emulator is faster than the real service for a point write; the real figure for the projection step will differ.
- The event time is ordering's own clock at the moment it raised the event; the screen reports now minus that. On one machine the clocks are the same.

## What else was checked in this step

- **The metrics are exported and read.** The stream hub's meter (`OrderingService.VendorStream`: open streams, messages written, streams the server closed by reason, delivery delay in ms) is now named in `AddBakeryTelemetry` (an optional list of meters; the shared registration is otherwise unchanged) and leaves ordering over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, as the traces do. Two new tests in `VendorOrderStreamMetricsTests.cs` read the hub's own meter: the open count goes up with a stream and back to zero when it closes, one message is counted with a delay between 0 and 5000 ms, and a stream replaced by a newer one is counted under `replaced`. The delay is measured with the injected clock the events are stamped with. An OTLP collector was **not** run, so the export itself is configured, not seen.
- **First-pass security review** of the stream endpoint, hub, BFF route, web route and screen (a read of the code by the AI agent, not an independent review; the lead's review is the Definition of Done's item). What it found is below.
- **Tests, after the change:** ordering 425 passed and 6 skipped under the Linux 2-CPU check with its Redis (the Redis tests ran); 420 passed and 11 skipped locally without Redis (the 5 Redis stream tests report as skipped); BFF 107 passed; `packages/web-session` 121 (108 passed, 13 Redis-only skipped); queue display 22 unit and 32 browser tests; customer app 64 browser tests.

## What the review found

- **Fixed in this step:** the BFF counted a stream against its limit when the request arrived, before the library had read the body. Anyone could send a body slowly, hold the places and push real screens into polling. A place is now taken when a valid subscription is being established. A test with a slowly sent body fails against the earlier code and passes now.
- **Registered, not fixed:** items 125 (a slow Redis subscribe holds the hub's gate for every vendor on the instance), 126 (the web route counts before reading its body and has no per-session limit; needs the lead's approval, shared auth-adjacent code) and 127 (order changes cross Redis Pub/Sub in the clear and include the customer id, readable by anything that can reach the events Redis; the event streams already carry it).
- **Held up under the read:** the vendor id comes only from the validated token and the document's own vendor id is checked again before it is queued; a token with no expiry, or past it, opens nothing; the stream ends at the token's `exp` and at the maximum age; a client that stops reading is dropped once its queue of 64 fills (a slow-client test; Kestrel's default minimum data rate on a blocked write is a further backstop that was not tested); channel names are literal; the token is never logged (a test reads every log line); errors keep the BFF's safe shapes; the browser holds no token; request bodies are limited on every route that reads them.
- **Accepted by ADR-0021:** there is no revocation before expiry; a stream outlives a change of role until the token expires (the web route ends it when the session ends).

## What was not run

- **Real token expiry.** The mock issuer's access tokens last an hour and the lifetime is not configurable, so a stream ending at a real issuer's expiry and reopening with a renewed token was not seen on the real stack. It is covered in pieces: ordering closes at a two-second token's `exp` (a .NET test), the web route renews on every open (package tests), and the screen re-opens a stream that ended after a healthy life (unit and mock-backed browser tests).
- A stream cut in the real stack (a restarted service or Redis), a real browser other than Chromium, a proxy or ingress in the path, the container images (the queue display has none), and an OTLP collector.
- An earlier attempt of this step failed in two tests because the orders were rejected for stock: the journeys use the seeded sourdough stock and the first run of the new tests had not restocked. The tests now restock what they use and take it back; a later run on a stack kept up from the failed run also showed "sold out", which was that stack's leftover state, not the code. The reported run is from a freshly started stack.

## Repeating it

```
node scripts/ci/skeleton-smoke.mjs            # the whole stack, the 25 journeys, teardown; LIVE_DELAY_ORDERS=50 for a longer measurement
node scripts/dev/check-stream-passthrough.mjs # the built queue display relays a stream unbuffered (needs npm run build there first)
```
