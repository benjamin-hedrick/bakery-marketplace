# Cache and AI-collaboration plans

## Three cache layers

1.  **Server/data-source:** optional; only for a named path and measured
    need. Define key/scope, TTL, invalidation, failure behavior, and
    authorization partitioning.
2.  **Relay normalized client store:** client composition/refetch;
    isolate environment per SSR request and browser session; define
    mutation updates/refetch.
3.  **HTTP/browser/CDN:** explicit route/header policy.
    Authenticated/personalized responses default to private/no-store
    unless a reviewed policy proves safe.

C# remains authoritative for price, availability, pickup eligibility,
and order state. Checkout revalidates critical fields. Cache failure
must not bypass authorization or validation. Initially, do not add
Redis/distributed cache without a concrete need and measurement plan.

For each active cache record owner, key/scope, freshness, invalidation,
failure behavior, privacy classification, consistency expectation, and a
stale/unauthorized-data test.

## AI collaboration

Use bounded tasks, context packets, human review, and independently
verified results. Agents separate facts from assumptions and stop when
contracts are ambiguous. Do not let agents concurrently edit shared
files without an integration owner.

Evidence ledger: work-item ID/date; agent/tool/model if known;
task/context version; starting commit; files changed; human review;
exact commands/results; defects/rejected suggestions/rework; measured
time if collected; security notes; commit/PR/artifact links; outcome and
lessons. Never include secrets or sensitive customer data.

Potential experiments: AI test generation, AI failure triage,
context-packet quality. Define baseline and metrics before running; do
not claim productivity gains unless measured.
