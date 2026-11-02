> **Status:** In progress · remaining: steps 4 to 7 (the BFF subscription, the web app's streaming path, the screen's live mode, the measured delay) and the security review; steps 1 to 3 are built

> **Progress note (2026-11-02, step 1):** the broadcast adapter is in `tools/BakeryMarketplace.Eventing`: `IBroadcastPublisher` and `IBroadcastSubscriber` (`IBroadcast.cs`), `InMemoryBroadcast` and `RedisBroadcast` (Redis Pub/Sub). One contract-test base, `BroadcastContractTests` (14 tests: delivery to every subscriber, across instances, no replay, channel isolation, literal channel names, ordering, one message at a time per handler, a throwing handler isolated, nothing after disposal, disposing twice, unusual text), is run by `InMemoryBroadcastTests` and `RedisBroadcastTests`. Run against the Compose Redis (`REDIS_CONNECTION_STRING=127.0.0.1:6379`) all 15 Redis tests pass; without Redis that class falls back to the in-memory backend and says so in its output. The contract test found one bug in the first draft (disposing twice threw). Nothing uses the adapter yet.

> **Progress note (2026-11-02, step 2):** the lead approved the stream endpoint including the token handling and expiry. Built in `services/ordering-service`: the projection publishes the saved document (JSON) to `vendor-orders:{vendorId}` after each save (a failed publish is logged and never fails the event); `Streaming/VendorOrderStreamHub.cs` keeps one broadcast subscription per vendor per instance (opened with the first stream, disposed with the last), turns each message into the list's vendor view once using the names the instance already holds (no store read) and queues it for each of that vendor's streams, after checking the document's vendor id again; `GET /ordering/vendor/orders/stream` (`Api/VendorOrderStreamEndpoint.cs`, policy `VendorRole`, vendor id from the token) sends `event: order` (id `{orderId}:{sequence}`), a `: heartbeat` comment every 15 seconds, and ends with `event: expired` (reason `token` or `max-age`) at the token's `exp` claim or after 1 hour, whichever is first, or `event: closed` (reason `replaced`, `slow-client`) when the server closes it. A token without `exp` or already past it opens nothing (401). A vendor's 6th stream closes their oldest; an instance over `MaxStreamsPerInstance` (500) answers 503 with `Retry-After`; a stream whose queue (64) fills is dropped. Settings: section `VendorStream`. The broadcast backend follows `Events:Backend` (Redis Pub/Sub on the same connection, or in-memory). The vendor view gained `lastSequence` (additive; the BFF does not expose it yet, step 4). Metrics (`System.Diagnostics.Metrics`, meter `OrderingService.VendorStream`): open streams, messages sent, server closes by reason, delivery delay in ms. 17 new tests in `VendorOrderStreamTests.cs` against the in-process host with the in-memory broadcast (access, delivery with names and sequence, another vendor never receives, heartbeats, token expiry at the token's time, max age, subscription freed, the limits, a slow client dropped, a failed publish, no token in any log line); the ordering suite passes (417 passed, 6 skipped). Not yet done: the same on two hosts over Redis (step 3), a read of this code by the lead (auth logic), the wire format through the BFF and the web app (steps 4 and 5). The `exp` is read from the validated principal; the stream gets its own deadline and is not shortened by the validation clock skew (2 minutes).

> **Progress note (2026-11-02, step 3):** two hosts of the ordering service on one real Redis (Compose `redis-events`, `REDIS_CONNECTION_STRING=127.0.0.1:6379`; `Events:Backend=redis` gives Streams for the events and Pub/Sub for the broadcast). `VendorOrderStreamRedisTests.cs` (partial class of `VendorOrderStreamTests`): a change placed through host A reaches streams open on A and on B; a vendor's confirm on A reaches a stream on B with a higher sequence; another vendor's stream on B receives nothing; the Redis subscription count for the vendor's channel is 1 while several streams are open on one host, 2 with a stream on each of two hosts, and 0 after the last close (read with `PUBSUB NUMSUB`). These tests use a `RedisFact` attribute: without Redis they are reported as skipped (5 skipped, 18 passed), never as passed. One more test, for the channel being unavailable: opening a stream answers 503 with `Retry-After` while the list still works. With Redis up: 23 passed, 0 skipped, repeated 5 times. Because Streams give each event to one instance, these hosts compete for the events, so the instance that projects an event is often not the one that took the request; the tests pass either way, which is the point. Not done: a run with the whole stack and a browser (steps 5 to 7).

> **Progress note (2026-11-02, dependency):** `graphql-sse` is chosen and pinned at exactly **2.6.3** in `services/graphql-bff` and `apps/web-queue-display` (the open point of ADR-0021 decision 1, accepted by the lead). The review, including a rebuild of the `v2.6.3` git tag that reproduced all 51 published files byte for byte (the package has no npm provenance attestation), is in `docs/evidence/WI-QUE-003/graphql-sse-review-2026-11-02.md`. Nothing uses it yet; step 4 does. The BFF will send only `POST /graphql` requests with `Accept: text/event-stream` to the library's handler, so its single-connection mode and `GET` form stay unreachable.

```
WI ID:               QUE-003
Title:                Live updates to the vendor queue: push over a stream, polling kept (backlog N-04, ADR-0021)
Type:                 Service Implementation
Epic:                 EPIC-QUEUE-DISPLAY
Shared with epic(s):  EPIC-ORDERING, EPIC-EVENTING
Hat/Owner:            Engineering/Build, Architect
Status:               In progress
Size:                 L
```

**Context / Why**
The queue display polls every 7 seconds (`WI-QUE-002`). ADR-0021 (Accepted 2026-11-02) adds push in front of polling: the changed order, whole, goes to the vendor's open streams, and polling stays as the baseline and the fallback. This item builds it in the order the ADR gives.

**Inputs / References**
- *Decisions*: ADR-0021 (the design and the decisions taken), ADR-0003 (events), ADR-0004 (the read model), ADR-0006 and ADR-0008 (the service validates the token and takes the vendor from it), ADR-0012 and ADR-0013 (the BFF is the browser's only API), ADR-0019 (the session cookie; the web app's route attaches the bearer header).
- *Code*: `services/ordering-service/src/Persistence/VendorOrderProjection.cs` (where a changed document is published), `VendorOrderDocument.cs`, `Api/VendorOrderEndpoints.cs`, `services/graphql-bff`, `apps/web-queue-display`, `packages/web-session` (the proxy), `tools/BakeryMarketplace.Eventing`.
- *Register*: item 113 (no read per order), 116 (screen renewal, solved by ADR-0019).

**Out of scope**
- The vendor's actions in the queue UI.
- Push to the customer's order-status page.
- API Management streaming in the cloud (checked when a cloud path is built; ADR-0021 decision 4).
- A managed push service.

**Requirements / Acceptance Criteria**
Build in this order, each step tested before the next.
1. **Broadcast adapter** (`tools/BakeryMarketplace.Eventing`): interface, in-memory and Redis Pub/Sub implementations, one contract-test base. *Built.*
2. **Ordering stream endpoint** `GET /ordering/vendor/orders/stream` (SSE; vendor role required; the vendor id comes from the token, never the request). The projection publishes the updated document to `vendor-orders:{vendorId}` after it saves. The endpoint subscribes to the vendor's channel when its first stream opens and unsubscribes with the last. Sends each changed document, a heartbeat comment every 15 seconds, a final `expired` event and a close when the token expires, and a close at the maximum age (default 1 hour). At most 5 streams per vendor (the oldest is closed for the sixth); a per-instance cap; a client that cannot keep up is dropped. Tests with the in-memory broadcast: another vendor's changes are never received, a customer or an anonymous caller is refused, expiry and age close the stream, limits hold, heartbeats arrive, nothing token-like is logged.
3. **Two instances**: a test with the Redis broadcast and two hosts: a change applied on one is received by a stream on the other.
4. **BFF**: `Subscription.vendorOrderChanged` (graphql-sse), opening the ordering stream with the caller's bearer token unchanged and passing documents through; the BFF decides nothing. Schema and Relay compile; BFF tests.
5. **Web app streaming path**: the proxy route streams the response without buffering or compression, and carries the session cookie's token as in `WI-AUTH-007`; a stream that ends at token expiry is re-opened by the client.
6. **Screen**: a "live" indicator while the stream is healthy and "polling" when not; apply a changed order only if its sequence is higher; a consistency poll every 60 seconds while live and every 7 seconds when not; reconnect with backoff; dead-stream detection (no heartbeat for 45 seconds). The new-order highlight and announcement work from either source. Browser tests for live, drop to polling, and recover.
7. **Evidence**: a run on the real stack that records the delay from an event's `occurredAt` to its delivery (p50, p95) and shows it on the screen; `docs/evidence/WI-QUE-003/`. ADR-0012 gets a dated note, `WI-QUE-002` records that polling is now the fallback, and the open-stream count, messages sent, drops and delay are logged as metrics.

**Dependencies**
- Blocked by: `WI-QUE-001`, `WI-QUE-002`, `WI-AUTH-007` (all built); ADR-0021 accepted. The token-expiry and cookie handling in step 2 and step 5 is auth logic: the lead's approval before it is written.
- Blocks: the vendor actions UI is independent.

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: a security review of the stream endpoint (vendor scoping, expiry, limits, logging).

**AI-agent suitability**
Parts. The adapter, the BFF subscription and the screen are well specified. The stream endpoint's authentication and expiry are security-sensitive and need the lead's review.

**Open Points (working)**
*(none: the `graphql-sse` version was pinned and reviewed on 2026-11-02)*
