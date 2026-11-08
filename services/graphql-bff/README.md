# graphql-bff

The browser's single API entry point (ADR-0013): a Node and TypeScript GraphQL server in front of the C# services. It does composition and error mapping only; business rules, prices and order state stay in the services.

**Status (2026-11-08): built, run locally only.** Queries `node`, `listings` (with a tag filter), `listing`, `tags`, `pickupWindows`, `order`, `orders`, `paymentMethods`, `preferences`, `personalizedListings`, `personalizedListing`, `cartCheck`, `vendorOrders` and `vendorOrder`; mutations `placeOrder` (a success or a typed rejection), `cancelOrder`, `vendorOrderAction` and `savePreferences`; the subscription `vendorOrderChanged` (below). It forwards the caller's bearer token and `traceparent` unchanged, issues Relay global ids, maps service errors to safe client errors that carry a trace id, and exports one span per successful request.

```
npm ci
npm run typecheck
npm test                    # no Docker needed; the count is in `docs/testing.md`
CATALOG_URL=http://localhost:5200 ORDERING_URL=http://localhost:5300 npm start    # port 4100
```

`ORDERING_URL` defaults to `http://localhost:5300`; `CHECKOUT_TIMEOUT_MS` defaults to 15000 and reads time out at 5000 ms. Live updates (`WI-QUE-003`, ADR-0021): `Subscription.vendorOrderChanged` is served over Server-Sent Events by `graphql-sse` (pinned 2.6.3, reviewed in `docs/evidence/WI-QUE-003/`) and only for a `POST /graphql` that sends `Accept: text/event-stream` with a `Content-Length` of at most 64 KB; it opens ordering-service's stream with the caller's token, ends the connection to ordering the moment the caller leaves, and treats ordering as dead after `STREAM_IDLE_MS` (default 45000) without a heartbeat. `MAX_STREAMS` (default 500) caps the subscriptions one instance holds; beyond it a new one is refused with 503. The schema is `schema/schema.graphql` (also read by the web app's Relay compiler). How it fits: `docs/architecture/c4/container.md` and `docs/architecture/request-path.md`.
