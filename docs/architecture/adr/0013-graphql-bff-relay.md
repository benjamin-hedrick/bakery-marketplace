# ADR-0013: GraphQL BFF (Node.js/TypeScript) and Relay Client

**Status:** Accepted (2026-10-26) — amends ADR-0008 (frontend entry path). Validation pending `WI-PORT-002`.

## Context

ADR-0008 made Azure API Management the single entry point for the frontend apps, and ADR-0011 had the browser calling services directly. ADR-0008 considered "a thin BFF on Container Apps" and noted that it was worth revisiting. ADR-0012 now requires Relay, and Relay needs a GraphQL endpoint. None of the four C# services expose GraphQL, and they shouldn't: they are the domain authorities (ADR-0009).

## Decision

**A standalone Node.js/TypeScript GraphQL BFF**, deployed as its own container, is the browser apps' API entry point. **Relay** is the web client.

**The BFF owns**: the client-facing GraphQL schema, resolver composition, typed downstream REST clients for the C# services, request batching where justified and tested, and stable client-safe error mapping.

**The BFF does not own**: business rules, persistence, pricing, availability, pickup eligibility, order state transitions, or authoritative validation. Those stay in the C# services (ADR-0009/ADR-0010). The GraphQL schema is a composition contract, not a second domain model.

**Relay owns**: query/fragment composition, generated types, the normalized client store, refetching and pagination. No second client query cache (no Apollo).

**Request path**:
- Browser / Next.js SSR → **BFF** (GraphQL) → **C# services** (REST).
- In the cloud, BFF → service calls go **through APIM**, so ADR-0008's edge fast-fail JWT check and coarse routing stay in place for service APIs. Locally, the BFF calls services directly, as ADR-0008 already allows.
- The browser no longer calls APIM or the services directly.

**Auth**: the BFF forwards the caller's bearer token unchanged on downstream calls. Each service still fully validates it and runs its own ownership checks (ADR-0006). The BFF performs no authorization decision of its own beyond rejecting obviously unauthenticated access to fields that require it. Public listing reads need no token.

**Mutations** define idempotency/retry behavior explicitly (`WI-PORT-007`). The BFF never retries a non-idempotent call blindly.

**Shared caching**: no authorization-sensitive data is shared across identities in any BFF-level cache (ADR-0014).

## Consequences

**Positive**
- One client-facing contract for all browser apps; Relay's evidence goals become reachable.
- APIM keeps its governance role for service APIs; ADR-0006's zero-trust model is untouched.
- The CORS surface shrinks to the BFF and Next.js origins.

**Negative / accepted limitations**
- A second backend runtime (Node) to build, test, deploy and instrument.
- Schema codegen plus downstream contract tests become required CI work (`WI-PORT-003`).
- One extra network hop on every read; this needs a latency budget in `nfrs.md` once measured.
- **Per-user rate limiting at the edge**: APIM's lack of `rate-limit-by-key` (ADR-0008) still applies to service APIs. Whether the BFF takes on any per-user throttling is left to `EPIC-RATE-LIMITING`, not decided here.

## Alternatives considered

1. **GraphQL inside each C# service (Hot Chocolate) or a C# gateway.** Keeps one backend language, but blurs the composition/domain boundary and weakens the Node/TypeScript BFF evidence goal.
2. **Expose the BFF through APIM as well.** Possible later. Not chosen for v1 because APIM Consumption adds little for a single GraphQL endpoint, and edge policy for GraphQL needs separate design.
3. **No BFF; REST from the browser (ADR-0008 as written).** Incompatible with Relay.

## Validation

`WI-PORT-002` proves one SSR query through the BFF to one C# API, including error mapping and request isolation.

## Related

- ADR-0008 — amended by this ADR (see its amendment note)
- ADR-0012 — frontend framework
- ADR-0006 — auth model, unchanged
- ADR-0016 — trace propagation through the BFF
- `open-items-register.md` #20 — re-resolved by this ADR
