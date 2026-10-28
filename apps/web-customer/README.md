# web-customer

Customer-facing browse/search/order UI.

**Status: WI-PORT-001 proof only.** This app currently proves Next.js (Pages Router) + Relay server-side rendering against a **mock** GraphQL server. It has no auth, cart, checkout or real BFF yet. Findings and evidence: `docs/evidence/WI-PORT-001/findings.md`. Decisions: ADR-0012, ADR-0013, ADR-0014.

## Run it (from `apps/web-customer`)

```
npm ci
npm run typecheck          # runs relay-compiler, then tsc
npm run build              # relay-compiler + next build
npm run mock               # terminal 1: mock GraphQL on :4000
ENABLE_TEST_HOOKS=1 npx next start -p 3000    # terminal 2 (production build)
npm run test:isolation     # 200 concurrent SSR requests, two fixtures
npm run test:e2e           # Playwright (starts the servers itself if they are not running)
```

On first use run `npx playwright install chromium`.

**Two builds, two directories.** `GRAPHQL_URL` is baked into the build (the `/api/graphql` rewrite), so `node scripts/ci/skeleton-smoke.mjs` builds into `.next-skeleton` (`NEXT_DIST_DIR`) and never touches `.next`, the build the mock-backed `npm run test:e2e` uses. Before 2026-10-28 they shared `.next`, and the mock e2e failed after a smoke run until you rebuilt.

`ENABLE_TEST_HOOKS=1` lets a request pick fixture data via `x-fixture` and add latency via `x-delay-ms`. It is off by default and must never be set outside tests.

## How the Relay/SSR pattern works

- `getServerSideProps` creates a **new** Relay environment per request, fetches the page query, and returns the store's records as page props. Next escapes them into `__NEXT_DATA__`.
- Server rendering uses a separate network-less environment built from those records, so a render can never fetch.
- In the browser, one environment per session merges the server records in (`src/lib/relay/useHydratedEnvironment.ts`), so first paint needs no GraphQL request and client navigation reuses the same store.
- Generated Relay artifacts (`src/__generated__/`) are gitignored and rebuilt by `npm run relay`.
