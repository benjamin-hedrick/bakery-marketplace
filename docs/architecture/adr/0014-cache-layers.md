# ADR-0014: Cache Layers — Ownership and Freshness Beyond the Server Cache

**Status:** Accepted (2026-10-26) — extends ADR-0002; does not replace it.

## Context

ADR-0002 defines the **server/data-source** cache: `ICacheProvider` with Redis and local implementations, a resilient circuit-breaker fallback, a chaos decorator, cache-aside for catalog listings and search, a 60s TTL, and order/cart data never cached. That design is built and tested (`CACHE-001`–`004`). ADR-0012/0013 add two more places where data can be held: Relay's normalized client store, and HTTP caching of SSR pages and GraphQL responses (browser/CDN). Neither layer has defined ownership, freshness or privacy rules.

## Decision

Treat caching as **three distinct layers**, each with its own owner:

| Layer | Owner | Governing decision |
|---|---|---|
| 1. Server / data-source | C# services (`catalog-service` for listings/search) | **ADR-0002, unchanged** — `ICacheProvider`, cache-aside, resilient fallback. `WI-CAT-003` remains the listing-read integration. |
| 2. Relay normalized client store | Web apps (Relay environment) | This ADR |
| 3. HTTP / browser / CDN | Next.js routes and the BFF's HTTP responses | This ADR |

**Every active cache entry point must record**: owner, scope/key, freshness (TTL or revalidation), invalidation trigger, failure behavior, privacy classification, and a test. This applies to layer 1 retroactively as documentation only; ADR-0002's design does not change.

**Layer 2 — Relay**
- One Relay environment per SSR request and one per browser session; never shared across requests or users.
- Mutations declare their store updates or refetches explicitly (`WI-PORT-007`).
- On logout or identity change, the browser environment is discarded.

**Layer 3 — HTTP**
- Each route and response type sets an explicit `Cache-Control` policy; nothing relies on framework defaults.
- Authenticated or personalized responses (including any GraphQL response that used a bearer token) default to `private, no-store`.
- Public listing pages may use short shared caching only once a reviewed policy and test exist.
- No blanket SSR page caching.

**Cross-layer rules**
- The C# services stay authoritative for price, availability, pickup eligibility and order state. Checkout revalidates these server-side regardless of anything cached in layers 2–3.
- A cache failure in any layer must not bypass authorization or validation.
- **No new BFF-level server cache** (a fourth layer) without a named path, a measurement plan and a decision record.

## Consequences

**Positive**
- Keeps ADR-0002's built and tested work exactly as it is.
- Closes the privacy gap between server and browser caching that SSR + GraphQL introduce.
- Gives `WI-PORT-004` concrete per-cache acceptance fields.

**Negative / accepted limitations**
- Stale reads can now come from three layers. Tests must cover stale-data rejection at checkout, mutation refetch, SSR isolation and authorization isolation.
- More documentation overhead for each new cache entry point.

## Alternatives considered

1. **Supersede ADR-0002 with a "no server cache by default" stance** (as originally drafted). Rejected: it would orphan built, tested, reviewed work without any evidence that it's harmful.
2. **One generic cache abstraction spanning all layers.** Rejected: it hides which owner is responsible for freshness and privacy at each layer.

## Related

- ADR-0002 — layer 1, unchanged (see its amendment note)
- ADR-0012, ADR-0013 — introduce layers 2 and 3
- `WI-PORT-004`, `WI-CAT-003`, `EPIC-CACHING`

## Amendment note (2026-11-07: the listing path is recorded)

The decision is unchanged. The per-cache record this ADR asks for is filled in for the listing path in `WI-PORT-004` (In review): layer 1 is the catalog's `ListingCache` (`WI-CAT-003`), layer 2 adds a fresh `network-only` stock read when an item is added to the order (`WI-CUST-009`), and layer 3 now has an explicit `Cache-Control` on every route of that path (the catalog's public reads `no-cache`, the listing pages `private, no-store`). The one gap found, the session proxy's own refusals carrying no policy (register 159), is closed by a `no-store` default for every `/api` response in both web apps' `next.config.js`.
