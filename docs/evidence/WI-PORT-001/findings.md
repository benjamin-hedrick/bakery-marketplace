# WI-PORT-001 Findings — Next.js Pages Router + Relay SSR proof

> **Current result (2026-10-30):** the recommendation (proceed, in-repo Relay integration) was followed, and `apps/web-customer` implements slice 1 on it. Follow-ups at the end of this file: the connection types were added; the root workspace was **not** created (the packages stay separate); the exact Node LTS pin is still open (`engines` say Node 24 or later); ADR-0012 has a validation outcome and a 2026-10-30 note; the `x-fixture` hooks remain in the mock-backed suite only, gated by `ENABLE_TEST_HOOKS`.

**Date:** 2026-10-26 · **Branch:** `feature/PORT-001-relay-ssr-proof` · **Code:** `apps/web-customer/` · **Recommendation: PROCEED** (with an in-repo Relay integration, not `relay-nextjs`)

## Versions and configuration

| Item | Version | Note |
|---|---|---|
| Node.js | 25.9.0 | Local machine. **Not an LTS release**; not yet run on an LTS (see constraints) |
| npm | 11.12.1 | |
| Next.js | 16.4.3 | Pages Router; Turbopack build; built-in Relay transform (`compiler.relay`) |
| React / react-dom | 19.3.0 | |
| react-relay / relay-runtime / relay-compiler | 21.0.1 | Ships its own TypeScript types |
| graphql (mock only) | 16.14.2 | |
| TypeScript | 5.9.3 | `strict: true` |
| @playwright/test | 1.64.0 | Chromium only |

All versions are exact pins, except that Next.js was raised to 16.4.3 for security (below). Everything else is the newest release at least 14 days old on the day of the proof, except that TypeScript is held at the latest 5.x (5.9.3) rather than 7.0.2 to keep the proof about Relay SSR, not a compiler upgrade. `npm audit`: **0 vulnerabilities**.

Mock GraphQL server (`mock-bff/`) runs real `graphql-js` against `schema/schema.graphql`, which is the read-only subset of `docs/architecture/first-slice-contract.md` §5 plus the standard Relay connection types. Fixture A mirrors the contract's §7 seed (cents); fixture B shares no names or IDs with A.

## Acceptance results

| Criterion | Result | Evidence |
|---|---|---|
| HTML contains listing content before hydration | **Pass** | Playwright with JavaScript disabled sees all 3 listings and `$8.00`; `curl` of `/` contains all three names |
| Relay artifact/type generation and build work from a clean checkout | **Pass** | Fresh copy of tracked files, `npm ci` → `npm run typecheck` (4 reader, 3 normalization, 4 operation documents) → `npm run build` all succeed; artifacts are gitignored and regenerated |
| No relevant hydration warnings or duplicate/stale-state defects | **Pass** (Chromium, production build) | Test collects every console `error`/`warning` and `pageerror` on load: none. It also asserts **zero** browser GraphQL requests on first paint, so SSR data was reused rather than refetched |
| Client refetch/navigation updates expected data | **Pass** | Navigation list → detail → list keeps a `window` marker (no full reload); detail shows `$4.50` and the modifier. After the mock revision changes, `Refresh` (`useRefetchableFragment`, `network-only`) updates the first price from `$8.00` to `$8.25` |
| Concurrent SSR requests with different fixtures cannot leak data | **Pass** | 200 concurrent requests (100 per fixture, random 0–250 ms upstream delay) in ~0.55 s: every response had only its own fixture in both HTML and `__NEXT_DATA__`. A separate Playwright test runs two browser contexts with different fixtures concurrently, including after client-side refetch |

## The tests can fail

Both checks were verified against deliberate faults, then the faults were removed and everything rerun green from a clean build:

- A module-level **shared server environment** made the isolation script fail **100 of 200** requests (fixture B pages showed fixture A data), and failed the browser isolation test.
- A **non-deterministic render** (`Math.random()` in the heading) failed the hydration test.

## Other checks

- Test hooks (`x-fixture`, `x-delay-ms`) are inert unless `ENABLE_TEST_HOOKS=1`: with the flag unset a request asking for fixture B and a 1.5 s delay returned fixture A in 8 ms.
- Unknown listing IDs return HTTP 404; opening a detail URL directly is server-rendered.

## Decision: `relay-nextjs` rejected, in-repo pattern adopted

`relay-nextjs@3.0.1` was evaluated against `docs/management/portfolio-slice/09-owners-and-defaults.md`:

- **Fails criterion 4 (trustworthy and maintained).** It depends on `serialize-javascript@^5`; `npm audit` reports a **high-severity** advisory set (RCE via `RegExp.flags`/`Date.prototype.toISOString`, CPU exhaustion, XSS via unescaped `</script`) with **no fix available**. That package is what serializes server data into the page, which is the exact surface this proof is about. The latest release is from January 2025, and it declares no `react` or `next` peer dependencies.
- It was **not exercised functionally**, so this is a security and maintenance rejection, not a finding that it cannot work.
- The replacement is about 100 lines (`src/lib/relay/`): a new environment per `getServerSideProps` call, records returned as ordinary page props (Next escapes them into `__NEXT_DATA__`), a network-less environment for the server render, and one environment per browser session that merges the records in. No custom serializer is needed.

## Constraints and observations

1. **Next.js 16.4.0 has critical advisories** (RCE in the image optimizer with SVGs, RCE in `use cache` with typed arrays, an App Router DoS). Fixed in 16.4.3. Most affect features this app does not use, but the pin is 16.4.3 or later. This overrode the two-week release-age rule.
2. **`relay-compiler` refuses to run if the artifact directory is missing**, which is the clean-checkout state. `scripts/ensure-artifact-dir.mjs` creates it before every compile.
3. **Relay exposes no public type for its serialized record map.** The type is derived from `RecordSource`'s constructor.
4. **Every client navigation to a `getServerSideProps` page makes a server round trip** (and a downstream GraphQL call) even if Relay's store already holds the data. That is inherent to this pattern, not measured here. Authenticated pages are planned to render client-side (ADR-0012), where Relay can serve from the store; revisit if public detail navigation latency matters.
5. **The same GraphQL contract is used through a Next.js rewrite** (`/api/graphql` → BFF), so the browser stays same-origin. Header forwarding through the rewrite worked for the test headers; auth and `traceparent` forwarding are not exercised.
6. `useHydratedEnvironment` publishes records during render. It is idempotent, but StrictMode's double rendering only occurs in `next dev`, which was **not** tested, so that case is unverified. It deserves a second look when auth and mutations arrive.

## Not covered (explicitly out of scope or not run)

- Node LTS (24) — only Node 25.9.0 was run; CI should pin an LTS and confirm.
- Firefox and WebKit; `next dev` mode (StrictMode double rendering); mobile viewports.
- Authentication, mutations, GraphQL error and timeout rendering, pagination (`after`), streaming.
- Multi-instance deployment or load beyond 200 concurrent requests in one process.
- Accessibility checks, performance budgets, and trace propagation (`WI-PORT-005`).
- Any real C# service (`WI-PORT-002`).

## Reproduce

See `apps/web-customer/README.md`. From `apps/web-customer`: `npm ci && npm run typecheck && npm run build`, start `npm run mock` and `ENABLE_TEST_HOOKS=1 npx next start -p 3000`, then `npm run test:isolation` and `npm run test:e2e`.

## Recommendation

**Proceed.** Pages Router + Relay SSR works with Next 16.4.3, React 19.3 and Relay 21 using the in-repo pattern. No framework switch, Apollo, or global unisolated environment was needed or used. Follow-ups for `WI-PORT-002` and the integrator:

1. Add `ListingConnection`, `ListingEdge` and `PageInfo` to `first-slice-contract.md` §5.
2. Create the root workspace/lockfile and move `services/graphql-bff` into it (this proof is deliberately self-contained).
3. Pin a Node LTS and run these same checks on it in the Azure pipeline (`WI-PORT-003`).
4. Add an amendment note to ADR-0012's Validation section recording the outcome and the `relay-nextjs` rejection.
5. Decide how `x-fixture`-style test hooks are replaced once the real BFF and seed data exist.
