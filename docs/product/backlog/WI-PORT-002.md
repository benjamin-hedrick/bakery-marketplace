# WI-PORT-002 --- Walking skeleton

```
WI ID:               PORT-002
Title:                Walking skeleton: Next.js SSR → GraphQL BFF → C# API
Type:                 Integration
Epic:                 EPIC-PORTFOLIO-SLICE
Shared with epic(s):  EPIC-WEB-CUSTOMER, EPIC-CATALOG, EPIC-CI-CD, EPIC-OBSERVABILITY
Hat/Owner:            Engineering/Build (one implementation owner)
Status:               Blocked (by WI-CAT-001 listing read endpoint). WI-PORT-001 is done; WI-PORT-007 decisions D-1 to D-4 are accepted. May start against the mock BFF.
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
