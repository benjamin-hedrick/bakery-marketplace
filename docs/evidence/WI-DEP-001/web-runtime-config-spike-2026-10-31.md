# WI-DEP-001: spike, how the web app reaches the BFF without a build per environment

> **Status:** Evidence · run 2026-10-31 on the development machine (Windows 11, Docker Desktop 29.1.3, Next.js 16.4.3, Node 24 in the images). Base commit `0f577a6`/`b52b089` (branch `feature/dev-environment`). The spike code was **not committed**; both variants are reproduced below. Register item 101, ADR-0020 decision 2.

## Question

`next.config.js` `rewrites()` fixes the BFF address into the image at build time (tested the same day: an image built for one `GRAPHQL_URL` ignores another at run time; the destination is stored in `.next/routes-manifest.json`). Can the browser's same-origin `/api/graphql` be forwarded to an address read at run time, with one image for every environment, and what does it cost?

## Variants

1. **Rewrite (current).** Build-time address.
2. **`src/proxy.ts`.** Next.js 16 renamed middleware to `proxy`; it rewrites `/api/graphql` to `process.env['GRAPHQL_URL']` on each request (8 lines):

```ts
export function proxy(_request: NextRequest) {
  const target = process.env['GRAPHQL_URL'];
  if (!target) return new NextResponse('GRAPHQL_URL is not set', { status: 502 });
  return NextResponse.rewrite(new URL(target));
}
export const config = { matcher: '/api/graphql' };
```

3. **`src/pages/api/graphql.ts`, an API route** (about 40 lines): reads the body, forwards an allowlist of request headers (`content-type`, `accept`, `authorization`, `traceparent`, `tracestate`, `baggage`, `x-test-payment`) with `fetch` to `GRAPHQL_URL`, returns status, body and the BFF's headers except hop-by-hop ones, and answers 502 with a fixed JSON body when the BFF cannot be reached.

Both variants had the `rewrites()` block removed from `next.config.js`, and the image was built **without** a `GRAPHQL_URL` build argument.

## Results

| Check | Rewrite | `proxy.ts` | API route |
|---|---|---|---|
| Same image, `GRAPHQL_URL` changed at `docker run` | ignored (request went to the built-in address) | followed (a stub listener answered) | followed (a stub listener answered) |
| `GRAPHQL_URL` unset | n/a | 502 | 502 |
| BFF unreachable | 500 | not tried | 502 with a fixed message, no address in the body |
| Full skeleton suite on a fresh stack (21 tests) | 21 passed | 21 passed | 21 passed (after the fix below) |
| Browser sees the internal BFF address | no | **yes: response header `x-middleware-rewrite: http://graphql-bff:4100/graphql`** | no |
| Request headers forwarded to the BFF | all | all | allowlist only |

Latency, through the web app's `/api/graphql` (`BFF_URL=http://localhost:3000/api/graphql node scripts/dev/measure-latency.mjs --reads 100 --orders 15`), three runs per row on a fresh container stack, mean of the three runs' p50 / p95. "Direct" is the BFF on port 4100 with no web hop. Sequential requests, one machine, one process each: a local data point, not a capacity claim. The 14 later checkouts per run are few and noisy (the API route's three runs had p50 of 75.0, 69.7 and 67.8 ms for the same code), so that column is weak evidence.

| Path | BFF listings query | BFF pickup windows | Later checkouts |
|---|---|---|---|
| Direct to the BFF | 21.8 / 27.3 ms | 4.2 / 5.8 ms | 52.5 / 69.0 ms |
| Rewrite (current) | 20.9 / 25.4 ms | 5.3 / 7.0 ms | 50.0 / 57.6 ms |
| `proxy.ts` | 25.7 / 31.8 ms | 7.0 / 10.0 ms | 59.6 / 65.1 ms |
| API route | 24.6 / 29.0 ms | 7.0 / 10.5 ms | 70.8 / 76.7 ms |

Reading: the rewrite adds about 1 ms over a direct call; either run-time variant adds about 2 to 5 ms more on reads. The two run-time variants are not distinguishable from each other on the read rows with this sample. The server-rendered home page does not use this path and is unchanged. Raw tables: `artifacts/spike/*.txt` (git-ignored).

## Findings

- **The API route failed one test at first.** The declined-payment journey sends an `X-Test-Payment` header from the browser; the allowlist dropped it, so the payment was not declined. A rewrite forwards every header, so this difference is easy to miss: any header the BFF reads has to be on the list. Fixed by adding it (the BFF ignores it unless `ENABLE_TEST_HOOKS=1`).
- **`proxy.ts` adds a response header that names the internal BFF address.** It is set by the framework; this spike did not find a way to remove it. Low severity (an internal container name), but the rewrite does not do it and the API route does not.
- The API route's responses carry an `ETag` that the BFF's did not; the response is `no-store`, so no effect was seen.
- **Re-running the skeleton suite on a stack where it has already run fails** `asking for more than is in stock` (the seeded croissants are sold out; the test says so in its comment "the seed has 4"). A fresh stack passes. Register item 104.

## Not tested

Streaming or very large bodies, GET requests, behaviour under concurrent load, the Linux agent, memory use of the extra hop, whether `proxy.ts` is stable across Next.js minor versions, and the browser-visible runtime configuration endpoint (the login addresses), which is separate work.
