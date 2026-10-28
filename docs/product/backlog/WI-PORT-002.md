# WI-PORT-002 --- Walking skeleton

> **Outcome note (2026-10-28):** built on `feature/WI-PORT-002-walking-skeleton`. Read path works end to end locally against the real stack (5/5 smoke, 16/16 BFF tests). Not met: **Azure Pipelines run** (update 2026-10-28: the pipeline, including the skeleton job, has since run green on Azure per the human lead) and **trace export** (traceparent propagated and logged by both sides, no OpenTelemetry; `WI-PORT-005`). Evidence: `docs/evidence/WI-PORT-002/findings.md`.

```
WI ID:               PORT-002
Title:                Walking skeleton: Next.js SSR → GraphQL BFF → C# API
Type:                 Integration
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-WEB-CUSTOMER, EPIC-CATALOG, EPIC-CI-CD, EPIC-OBSERVABILITY
Hat/Owner:            Engineering/Build (one implementation owner)
Status:               Ready (listing endpoints done: WI-CAT-001; SSR proof done: WI-PORT-001; contract decisions D-1 to D-4 accepted). Open: how the first end-to-end run is seeded. WI-DEV-002 (Compose, verified) is done, so WI-DEV-004 is unblocked; recommended: build it as the single seed source rather than an interim in-memory seed.
Size:                 TBD
```

**Decisions**: ADR-0012, ADR-0013, ADR-0015, ADR-0016.

**Relationship to existing backlog**: the C# side of this read path is `WI-CAT-001`'s listing read endpoint (`data-model-api-contracts.md`). If `CAT-001` hasn't landed, implement only that read endpoint, to `CAT-001`'s contract; don't define a competing shape. Seed data comes from `WI-DEV-004`'s mechanism (via `WI-PORT-007`'s seed contract), not a second seed source. This item supersedes `WI-WEB-001` as the first frontend scaffold.

**Prerequisites:** WI-PORT-001 accepted; first listing query and C# API
contract agreed (WI-PORT-007). One implementation owner.

## Goal

Prove one read path from Next.js SSR through GraphQL BFF to a C# API
with a test, pipeline, and trace.

## Scope

One seeded listing; minimal GraphQL schema/resolver and typed downstream
client; one Relay-backed SSR page; one unit/contract test; one
Playwright smoke test; basic trace/log propagation; local startup docs;
minimum Azure Pipelines pipeline.

## Exclusions

Checkout, real payments, distributed cache, mobile, production
deployment, unrelated refactoring.

## Acceptance

Clean setup works; SSR returns expected listing; generated Relay
artifacts/build succeed; tests run with exact results; trace shows
available hops and gaps; errors are client-safe; telemetry contains no
secrets/sensitive data.

## Handoff

List changed files, exact commands/results, trace evidence,
risks/limitations, and next smallest task.
