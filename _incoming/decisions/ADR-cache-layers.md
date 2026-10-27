# ADR: Cache ownership and freshness

-   **Status:** Proposed for adoption
-   **Decision:** Treat server/data-source, Relay client store, and
    HTTP/browser/CDN caching as distinct layers.

Each active cache needs owner, scope/key, freshness, invalidation
trigger, failure behavior, privacy classification, and test. Do not add
distributed cache by default. Server/data-source cache is optional and
justified by a named path and measurement. Relay is isolated per SSR
request/browser session. HTTP policy is explicit;
personalized/authenticated responses default to private/no-store.

C# remains authoritative for price, availability, pickup eligibility,
and order state. Checkout revalidates critical fields. Cache failure
must not bypass authorization or validation.

Rejected: one generic abstraction that hides ownership; immediate Redis
without a use case; blanket SSR caching. Test stale-data rejection,
authorization isolation, mutation invalidation/refetch, and SSR
isolation.
