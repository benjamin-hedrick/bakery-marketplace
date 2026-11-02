> **Status:** In progress · remaining: steps 2 to 7 (the ordering stream endpoint, the Redis fan-out between instances in the service, the BFF subscription, the web app's streaming path, the screen's live mode, the measured delay); step 1 (the broadcast adapter) is built

> **Progress note (2026-11-02, step 1):** the broadcast adapter is in `tools/BakeryMarketplace.Eventing`: `IBroadcastPublisher` and `IBroadcastSubscriber` (`IBroadcast.cs`), `InMemoryBroadcast` and `RedisBroadcast` (Redis Pub/Sub). One contract-test base, `BroadcastContractTests` (14 tests: delivery to every subscriber, across instances, no replay, channel isolation, literal channel names, ordering, one message at a time per handler, a throwing handler isolated, nothing after disposal, disposing twice, unusual text), is run by `InMemoryBroadcastTests` and `RedisBroadcastTests`. Run against the Compose Redis (`REDIS_CONNECTION_STRING=127.0.0.1:6379`) all 15 Redis tests pass; without Redis that class falls back to the in-memory backend and says so in its output. The contract test found one bug in the first draft (disposing twice threw). Nothing uses the adapter yet.

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
- The `graphql-sse` library version to pin and review when step 4 starts (ADR-0021 decision 1).
