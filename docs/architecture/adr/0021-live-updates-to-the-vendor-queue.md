# ADR-0021: Live Updates to the Vendor Queue (push as a nudge over a stream, polling kept)

**Status:** Accepted (2026-11-02) by the lead, with the decisions below taken as recommended and the maximum stream age shortened. It amends ADR-0012 (the queue display is no longer polling only) and builds on ADR-0003, ADR-0006, ADR-0008 and ADR-0013. How the stream is authenticated depends on the renewal design of ADR-0019, which was accepted the same day; see decision 5.

## Context

The vendor's order-queue display (`WI-QUE-002`, built 2026-11-02) **polls**: every 7 seconds it asks the GraphQL BFF for the vendor's orders in progress. That is what ADR-0012 and the work item specified, with real-time push named "a v2 candidate, not built". It works and is the simplest thing that does. It is not what this project is meant to show: the order events already flow through a durable event backbone (ADR-0003), the vendor read model is event-fed (ADR-0004, `N-03`), and the last hop from that to the screen is a timer.

What exists, and constrains the design:

- **Events.** Services publish to Redis Streams and subscribe with a consumer group per service and event type. Each event reaches **one instance** of a service (competing consumers), so the instance that updates the read model is not necessarily the one a vendor's screen is connected to. Redis Streams are durable and acknowledged; Redis Pub/Sub is not (fire-and-forget).
- **Entry path.** The browser talks only to the BFF through the web app's own origin (`/api/graphql`, ADR-0013). Every service validates the token itself (ADR-0006, ADR-0008: zero trust). The web app's proxy route (`graphql-proxy.ts`) reads and forwards whole bodies; it cannot stream today.
- **Login.** The access token is held in memory, lasts about an hour, and there is no refresh token (register items 24 and 116). The browser's built-in `EventSource` cannot send an `Authorization` header.
- **Reads.** The lead asked that a change be delivered without a read per order (register item 113). The vendor read model document, with names from the listing-name cache, already holds everything a screen shows.
- **Deployment.** Container Apps ingress in DEV (ADR-0020); API Management in front of the services in the cloud (ADR-0008). Locally everything is direct.

## Decision (proposed)

1. **Both, layered.** Push is added in front of polling; **polling is not removed**. The screen shows a "live" indicator while the stream is healthy and a "polling" indicator when it is not. Polling remains the baseline, the resynchronization after any gap, and the fallback when a proxy buffers or drops streams.

2. **What is pushed: the changed order, whole.** When an order's read-model document changes, the vendor's open streams receive that document (the same shape the list returns, ids and names, with its `lastSequence`). The client replaces the order in its list if the sequence is higher than the one it holds. Nothing is fetched per event. No history is replayed: a client that connects, or reconnects, first fetches the current list (the existing query) and then applies what arrives.

3. **Channel: a GraphQL subscription over Server-Sent Events** (the graphql-sse protocol, a streamed `fetch` on the client), exposed by the BFF as `Subscription.vendorOrderChanged`. One direction is all the display needs (vendor actions stay plain requests), so WebSockets and SignalR add nothing; SSE is plain HTTP and works through the same ingress. It keeps the BFF as the browser's only API (ADR-0013) and gives Relay's subscription support a real use. The BFF opens a matching SSE request to a new ordering endpoint, `GET /ordering/vendor/orders/stream`, forwarding the vendor's bearer token unchanged; **ordering validates it and takes the vendor id from it** (the BFF decides nothing).

4. **Fan-out between ordering instances: Redis Pub/Sub, behind an adapter.** After the projection applies an event it publishes the updated document on the channel `vendor-orders:{vendorId}`. An instance subscribes to a vendor's channel when its first stream for that vendor opens and unsubscribes with the last, and forwards messages to its own streams. Loss is acceptable (a missed message is repaired by the next change or by polling), which is why Pub/Sub is right here and Streams are not. It follows the repository's adapter pattern: an interface, an in-memory implementation for tests and single-instance runs, a Redis implementation, and one contract-test base both inherit.

5. **Authentication and expiry.**
   - The token is sent in the `Authorization` header of a streamed `fetch`, never in a URL or an `EventSource`.
   - Ordering **closes the stream when the token expires** (a final `expired` event, then the connection ends). A stream is never longer-lived than the credential that opened it, and also has a maximum age (configurable, **default 1 hour**, shortened from 8 on 2026-11-02 because the renewal design makes a reconnect invisible) in case a longer-lived credential is later chosen (item 116).
   - **If ADR-0019 is accepted** the browser holds no token at all: the stream request carries the session cookie, the web app's route renews the token if needed and attaches the bearer header to the call to the BFF, and a stream that ends at token expiry is re-opened by the client without the user noticing. Everything from the BFF down is unchanged. Until then (and as the fallback) the streamed `fetch` carries the bearer header as described.
   - There is no revocation before expiry, as for every request today (stateless tokens, no introspection); that is accepted and bounded by the token's life.
   - Until item 116 gives a screen a way to renew its login, expiry means the screen shows "log in again", exactly as polling does today.

6. **Limits.** A vendor may have at most 5 open streams (the oldest is closed for the sixth); an instance caps the total; a heartbeat comment every 15 seconds keeps ingress idle timeouts from closing the connection and lets the client detect a dead one (no heartbeat for 45 seconds means down); a client that cannot keep up is dropped and resynchronizes.

7. **Client behaviour.** Connect, fetch the list, apply changes by sequence number. While the stream is healthy the screen polls only as a consistency check (every 60 seconds, configurable). When the stream is down it polls every 7 seconds as now, and retries the stream with backoff. The new-order highlight and announcement work from either source.

## Options considered

| Option | Verdict |
|---|---|
| Polling only (today) | Kept as the baseline and fallback; not enough on its own for the project's purpose |
| A plain SSE route, outside GraphQL | Simpler to build, but a second API style in front of the BFF; an exception to ADR-0013. The fallback if the GraphQL subscription proves too heavy |
| WebSocket or SignalR | Two-way and not needed; more infrastructure and a different auth story |
| A managed service (Azure Web PubSub, SignalR Service) | Cost, a vendor dependency and a worse local-development story; reconsider if connection counts ever demand it |
| Fan-out by a consumer group per instance on Redis Streams | Durable but heavy: a backlog per instance, trimming, cleanup of dead instances, for a message that is worthless a minute later |
| Cosmos change feed | Not available through `IRepository`, and not what the event architecture uses |
| Pushing only an id and letting the client fetch | One read per change per client; contradicts the no-read-per-order requirement |

## Consequences

- **Easier:** the display reacts within the event delivery time (the outbox, the stream, the projection, one Pub/Sub hop) instead of up to 7 seconds; a better demonstration of the event architecture; the polling code, tests and screen stay as they are.
- **Harder:** streaming through four hops (browser, web app route, BFF, ordering) without buffering; the web app's proxy needs a streaming path with compression off; a new moving part in ordering (connections, per-vendor subscription, limits); more test types (a stream that breaks, expires, is cut by a slow client). API Management's handling of streamed responses in the cloud is **not verified** (it must be checked before the cloud path is claimed; locally and in DEV the BFF calls services directly).
- **Security:** the stream is a vendor-only endpoint; the vendor id never comes from the request; one vendor's channel is never subscribed from another's connection; the token never appears in a URL or a log.
- **Observability:** open-stream count, messages sent, drops and the delay from an event's `occurredAt` to its delivery are recorded, and the delay is shown on the screen in a demo.
- **Cost:** an always-open connection per screen; Redis Pub/Sub traffic proportional to order changes.

## Plan if accepted

A new work item (`WI-QUE-003`), in this order, each step tested before the next: the broadcast adapter with its contract tests; ordering's stream endpoint (auth, expiry, limits, heartbeat) tested with the in-memory broadcast; the Redis broadcast and a two-instance test; the BFF subscription and its pass-through; the web app's streaming path; the screen's live and polling modes; a run on the real stack that records the measured delay. ADR-0012 gets a dated note, and `WI-QUE-002` records that polling is now the fallback.

## Decisions taken (2026-11-02)

1. **GraphQL subscription over SSE** (the plain SSE route stays the fallback). It adds the `graphql-sse` library to the BFF and the web app: a dependency to choose, pin and review when `WI-QUE-003` starts.
2. **Expiry without renewal is accepted** until ADR-0019 is decided; with it, a screen renews its login on the server.
3. **Five streams per vendor; a maximum stream age of 1 hour.**
4. **API Management** and streaming in the cloud: to be checked when a cloud path is built, not assumed.

## Note, 2026-11-02: built, and two corrections to what the consequences section promised

The decisions above were built as `WI-QUE-003` and run on the real local stack (`docs/evidence/WI-QUE-003/real-stack-2026-11-02.md`). Two things in this ADR turned out differently from how they read. **The delay shown on the screen** ("the delay is shown on the screen in a demo", Consequences, Observability) is measured as now on the screen minus the time ordering stamped on the event, so it is meaningful only when the services and the screen share a clock; with the services in containers on Docker Desktop the container clock ran about a second behind the host's and the figure read about a second too high. The two figures that start from one clock (the request to the card on the screen: p50 94 ms, p95 131 ms; the answer to the card: p50 31 ms, p95 56 ms in that run) are the ones to quote. **Decision 6's limits** were extended after the first-pass security review and the lead's review: besides five streams per vendor and the heartbeat there are limits on the other side of every hop (a body of at most 64 KB and a required `Content-Length` at the BFF, a stream counted when it is established and not when the request arrives, five streams per login and 500 per process at the web app, a write timeout of 10 seconds on ordering's stream, and the web app's check that an open stream's session is still live, which backs off and ends the stream after three failures in a row). Decision 4 (API Management and streaming in the cloud) remains unchecked; register item 131 tracks it.
