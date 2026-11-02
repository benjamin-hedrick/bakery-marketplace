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
- **Registered:** items 125 (a slow Redis subscribe held the hub's gate for every vendor on the instance; fixed the same day with a lock per vendor, see the follow-up below), 126 (the web route counted before reading its body and had no per-session limit; fixed the same day with the lead's approval, see the follow-up below) and 127 (order changes cross Redis Pub/Sub in the clear and include the customer id, readable by anything that can reach the events Redis; the event streams already carry it).
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

## Follow-up after the lead's review questions (2026-11-02)

The lead asked for four changes at the review; all were made, each with tests that were checked to fail without the change.

| Change | What it does | Test that guards it, and how it was shown to fail |
|---|---|---|
| **A**: the session check of an open stream | While checks work they run every 10 s (plus up to 10%); after a failure the wait doubles (20 s, 40 s) up to six times the interval (60 s); after three failures in a row the stream is ended (about 70 s); a good check resets the count. | `graphql-stream.test.ts`: the gaps between three failing checks grow; one failure then recovery keeps the stream; the delays (`checkDelayMs`). Failed when the limit was made infinite. |
| **F**: write timeout | Each write to a client on ordering's stream, the final events included, has `VendorStream:WriteTimeout` (10 s) to finish; otherwise the stream is closed, counted under `write-timeout` and the connection dropped. | `VendorOrderStreamWriteTimeoutTests`: a client that opens the stream and never reads, while large changes are pushed, is closed and its place freed; a quiet stream that is read is not affected. Failed when the timeout was set to ten minutes (the stream was never closed, which also shows the concern was real). |
| **126**: places in the web route | The body is read before the stream is counted; a login may have 5 streams (`maxPerSession`, a sixth is a 429 with `Retry-After`) as well as 500 per process. | A slow body does not take a place (failed when the count was moved before the body); the per-session cap, another login unaffected, a freed place reusable. |
| **E**: accepted | The BFF forwards the token without validating it (ordering does); no rate limiting yet, now item 128. | not applicable |

**Decision D, the header shim** (the BFF wraps `res.writeHead` to write the `: ready` comment and to replace the library's `Cache-Control: no-cache` with `private, no-store`). It is covered by BFF tests in `vendor-stream.test.ts`: "answers as an uncached event stream that carries the trace id" checks the exact value `private, no-store` (the library's own value is `no-cache`, so a missed override fails it) and `X-Accel-Buffering: no`; "says it is ready, with a comment, as soon as the subscription is established, and not when it is refused" checks that `ready` is the first thing sent for an established stream and is absent for a refusal. What those tests cannot show is how the shim behaves under another version of the library, which is why it is pinned at exactly 2.6.3: raising the version means running these tests and the review record's steps again.

Counts after the follow-up: ordering 422 passed (11 skipped without Redis; 427 with it, 6 skipped), `packages/web-session` 127 (114 passed, 13 skipped), BFF 107, queue display 22 unit and 32 browser, customer app 64 browser.

The whole real stack was run again with these changes in (`node scripts/ci/skeleton-smoke.mjs`, started from a clean Docker state): 25 of 25 pass; the first order was on the screen 170 ms after the request; over 20 orders the delay from the event's time to the screen was p50 73 ms, p95 109 ms, max 130 ms (from the request: p50 109, p95 144, max 170; from the answer reaching the customer: p50 29, p95 63, max 65). The figures are within noise of the first run, so the write timeout and the body-first reading cost nothing measurable.

**Item 125, the hub's lock (fixed after the follow-up above).** `VendorOrderStreamHub` now has one lock per vendor and counts the instance's streams with an atomic reserve-and-release. Five new tests in `VendorOrderStreamHubTests.cs`, run three times: a subscribe stuck for one vendor does not delay another vendor's open or close (this one fails on the old hub: it times out); 40 opens at once for one vendor leave the limit of 5, one subscription and an exact count; 60 opens at once across 12 vendors never pass the instance limit of 10 and the refused ones give their reserved place back; 200 rounds of a close racing an open never leave the new stream on a disposed subscription (the new stream still receives the next message); a failed subscribe leaves nothing behind and the next open tries again. The other four pass on the old hub as well: they are the guard that the change kept what the single lock guaranteed.

## The same journeys with the application in containers (2026-11-02)

`COMPOSE_PARALLEL_LIMIT=1 node scripts/ci/skeleton-smoke.mjs --containers`: the catalog, ordering, BFF and customer web app run as the four containers built from the images the cloud dev environment uses (rebuilt for this run, so the BFF image carries `graphql-sse` and ordering carries the stream hub); the queue display runs as a host process because it has no image. **25 of 25 pass.** The first order was on the vendor's screen 172 ms after the request. Over 20 orders the delay from the request to the screen was p50 94 ms, p95 131 ms, max 134 ms, and from the answer reaching the customer p50 31 ms, p95 56 ms, max 60 ms, the same as with host processes.

**One figure in that run is not to be used:** the screen's own "event to screen" delay read p50 983 ms (min 749, max 1337). The event's time is stamped by ordering's clock inside the container and the screen subtracts it from the host's clock; Docker Desktop's virtual machine clock runs about a second behind the host's, so the figure measures that skew, not the delay. The two figures that start from the host's own clock (request to screen, answer to screen) are unaffected and agree with the run on host processes. The "event to screen" figure and the screen's `?delay=1` display are therefore meaningful only when the services and the screen share a clock (host processes on one machine, or a deployed environment with synchronized clocks); the ADR-0021 line "the delay is shown on the screen" should be read with that condition.

A first attempt failed building the BFF image with a Docker error about a missing parent snapshot in its build cache (`failed to prepare extraction snapshot`). That was Docker's cache, not the code: building that one image with `--no-cache` succeeded and the rerun passed.
