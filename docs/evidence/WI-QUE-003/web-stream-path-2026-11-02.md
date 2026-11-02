# The web app's streaming path (WI-QUE-003 step 5)

> **Status:** Done for the server side · run by the AI agent on 2026-11-02 on a developer machine (Windows 11, Node 25.9.0, `next start` of the production build of `apps/web-queue-display`), on the working tree directly above commit `c30aa55`; the commit that adds this record contains the code that was run. The browser side (a client that opens, reads and re-opens the stream) is step 6 and is not covered here.

## What was built

`POST /api/graphql-stream` in the queue display (`src/pages/api/graphql-stream.ts`, mounting `apiRoutes.graphqlStream` of `packages/web-session`): `createGraphqlStreamHandler` in `handlers.ts`, `proxyGraphqlStream` in `graphql-proxy.ts`, `SessionService.isActive` in `service.ts`. It:

- accepts only a POST that passes the CSRF checks (an `Origin` equal to the app's, a JSON content type) and asks for `text/event-stream`; anything else is 403, 405 or 406;
- needs a session (401 otherwise, and the BFF is not called); renews the access token if it is within the margin of expiring, exactly as the JSON route does; a refused renewal ends the session (401, cookie cleared, `x-session-ended`), an unreachable issuer with an unusable token is 503;
- reads a request body of at most 64 KB (413 above), forwards the allowed headers, drops any `Authorization` the browser sent and builds the bearer header from the session;
- relays the BFF's answer as it arrives, with `Cache-Control: no-store, no-transform` and `X-Accel-Buffering: no`, and without the BFF's `Content-Encoding` and connection headers;
- aborts the call to the BFF the moment the browser's connection closes;
- every 10 seconds (setting `sessionCheckMs`) asks whether the session is still live (`isActive`: it exists and is inside its idle and absolute limits, without counting as activity) and ends the stream if it is not, so a logout, an idle timeout or the absolute limit does not leave a stream running to the end of its token;
- relays at most 500 streams per server process (`maxOpen`); beyond it, 503 with `Retry-After`.

A stream that the BFF ends at the token's expiry is re-opened by the client: the new request goes through the same session lookup and renewal, so it carries a renewed token (tested at the server side: the first stream is completed after the clock passes the renewal margin and the second request makes one refresh-token call and reaches the BFF with a different bearer).

## Tests

- `packages/web-session/tests/graphql-stream.test.ts`, 16 tests, on real HTTP servers for the BFF and the app, run three times: frames arrive while the BFF has not finished; the bearer, body and headers that reach the BFF; the response headers; the BFF call closes when the browser leaves; logout and the idle limit end an open stream; re-open after expiry renews; refusals (401, 403 for origin and content type, 405, 406, 413); a BFF refusal is relayed with its status; a BFF that is down is 502 with a fixed message that names neither the address nor the reason; the issuer refusing a renewal ends the session; the issuer unreachable with an expired token is 503; the limit and its release; the token and the cookie never appear in a log line. The package has 120 tests (107 passed, 13 skipped: the Redis store tests, which need `REDIS_CONNECTION_STRING`).
- `node scripts/dev/check-stream-passthrough.mjs` (new): the real `next start` of the production build, a fake issuer, and a fake BFF that sends an event every 300 ms. It logs in through the app's own routes and opens the stream asking for `gzip, deflate, br`. Output of the run for this record:

```
PASS  logged in through the app (vendor-shop-001)
PASS  status 200
PASS  no content-encoding (got null)
PASS  cache-control: no-store, no-transform
PASS  content-type: text/event-stream; charset=utf-8
chunk arrival times (ms after request): 9, 314, 624, 936, 1251
PASS  frames arrived over time, not all at the end (spread 1242 ms across 5 chunks)
PASS  the BFF events came through
PASS  the BFF received a bearer token built from the session
PASS  the BFF received no cookie
PASS  the BFF received the event-stream accept header
PASS  the BFF has one stream open (1)
PASS  the call to the BFF closed 29 ms after the browser left
RESULT: all checks passed
```

## What this does not show

- A browser. The stream was read with Node's `fetch`; whether a browser, a corporate proxy or Azure Container Apps' ingress buffers it is not shown. The ingress and API Management are not part of any local run (ADR-0021 consequences).
- The real BFF or the real ordering service behind it: the BFF was a stand-in that sends events. The chain from ordering to the page is run together in step 7.
- Redis as the session store (the memory store was used, as in the browser tests); the renewal lock across instances is covered by the existing store tests, not by these.

## Found while building

- The JSON route (`/api/graphql`) reads a request body without a size limit (`readBody` in `graphql-proxy.ts`), since the framework's body parser is off. The new route limited its body; the old one did not. Recorded as register item 124 and fixed the same day with the lead's approval: `proxyGraphql` now reads at most 64 KB too (413 above it), with a test.
- Node runs the package's tests with type stripping, which does not allow constructor parameter properties; the test helper was written without them.
