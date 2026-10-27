# WI-PORT-002 --- Walking skeleton

**Prerequisites:** WI-PORT-001 accepted; first listing query and C# API
contract agreed. One implementation owner.

## Goal

Prove one read path from Next.js SSR through GraphQL BFF to a C# API
with a test, pipeline, and trace.

## Scope

One seeded listing; minimal GraphQL schema/resolver and typed downstream
client; one Relay-backed SSR page; one unit/contract test; one
Playwright smoke test; basic trace/log propagation; local startup docs;
minimum ADO pipeline.

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
