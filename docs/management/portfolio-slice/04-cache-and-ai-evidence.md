# Cache and AI-collaboration plans

> **Status:** Adopted plan · status checked 2026-10-30. Two parts are out of date.

> **Update 2026-11-08:** both out-of-date parts are now history: cache layer 1 is used by the catalog (`WI-CAT-003`) and the per-layer record exists (`WI-PORT-004`, both In review); evidence goes to `docs/evidence/` and the AI usage records, not to the activity log.

- **Cache layers:** layer 1 (the server cache library) is built and unused by any service; layers 2 and 3 are documented in ADR-0014 but no per-cache record or test exists (`WI-PORT-004`, `WI-CAT-003` unbuilt). The cache review is register item 89.
- **Evidence ledger:** the plan says entries go in `docs/history/ACTIVITY-LOG.md`. That log takes no new entries (register item 50). Evidence now goes in commit messages and pull request text, `docs/evidence/` for runs, and the register for findings; the AI-collaboration record is planned for `docs/method/`.

> **Adopted 2026-10-26** from the portfolio planning packet. Decisions referenced here are recorded in ADR-0012 to ADR-0016; this file holds the implementation approach, not the decisions. See `RECONCILIATION-DISPOSITIONS-2026-10-26.md`.

## Three cache layers

Decision: ADR-0014, which extends (does not replace) ADR-0002.


1.  **Server/data-source:** ADR-0002's existing `ICacheProvider` design
    (cache-aside for catalog listings/search, resilient local fallback,
    order/cart never cached), already built and retained unchanged. Record
    key/scope, TTL, invalidation, failure behavior, and authorization
    partitioning for each use (e.g. `WI-CAT-003`).
2.  **Relay normalized client store:** client composition/refetch;
    isolate environment per SSR request and browser session; define
    mutation updates/refetch.
3.  **HTTP/browser/CDN:** explicit route/header policy.
    Authenticated/personalized responses default to private/no-store
    unless a reviewed policy proves safe.

C# remains authoritative for price, availability, pickup eligibility,
and order state. Checkout revalidates critical fields. Cache failure
must not bypass authorization or validation. Do not add any new
server-side or BFF-level cache beyond ADR-0002's without a concrete need,
measurement plan, and decision record.

For each active cache record owner, key/scope, freshness, invalidation,
failure behavior, privacy classification, consistency expectation, and a
stale/unauthorized-data test.

## AI collaboration

Use bounded tasks, context packets, human review, and independently
verified results. Agents separate facts from assumptions and stop when
contracts are ambiguous. Do not let agents concurrently edit shared
files without an integration owner.

Evidence ledger: recorded as entries in `docs/history/ACTIVITY-LOG.md` (the
existing chronological record, not a separate ledger). Each entry
carries: work-item ID/date; agent/tool/model if known;
task/context version; starting commit; files changed; human review;
exact commands/results; defects/rejected suggestions/rework; measured
time if collected; security notes; commit/PR/artifact links; outcome and
lessons. Never include secrets or sensitive customer data.

Potential experiments: AI test generation, AI failure triage,
context-packet quality. Define baseline and metrics before running; do
not claim productivity gains unless measured.
