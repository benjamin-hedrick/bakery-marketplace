# graphql-bff

The browser's single API entry point (ADR-0013): a Node and TypeScript GraphQL server in front of the C# services. It does composition and error mapping only; business rules, prices and order state stay in the services.

**Status (2026-10-30): built, run locally only.** Queries `node`, `listings`, `listing`, `pickupWindows` and `order`; the mutation `placeOrder`, which returns a success or a typed rejection. It forwards the caller's bearer token and `traceparent` unchanged, issues Relay global ids, maps service errors to safe client errors that carry a trace id, and exports one span per successful request.

```
npm ci
npm run typecheck
npm test                    # 75 tests; no Docker needed
CATALOG_URL=http://localhost:5200 ORDERING_URL=http://localhost:5300 npm start    # port 4100
```

`ORDERING_URL` defaults to `http://localhost:5300`; `CHECKOUT_TIMEOUT_MS` defaults to 15000 and reads time out at 5000 ms. `ENABLE_TEST_HOOKS=1` forwards the declined-payment hook and must never be set outside tests. The schema is `schema/schema.graphql` (also read by the web app's Relay compiler). How it fits: `docs/architecture/c4/container.md` and `docs/architecture/request-path.md`.
