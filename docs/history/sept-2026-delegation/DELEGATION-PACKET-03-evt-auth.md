# Delegation Packet 03 — Event Transport + Ownership-Check Pattern

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

**Item(s) covered**: `WI-EVT-003` (`RedisStreamsPublisher`/`Subscriber`), `WI-AUTH-002` (per-service resource-ownership check pattern)
**Full specs**: `docs/product/backlog/WI-EVT-003.md`, `WI-AUTH-002.md` — condensed here; those files win on conflict.
**AI-agent suitability**: Yes for both.
**Delegation wave**: independent of every other packet in this round, and of each other. Paired here for handoff convenience only (both small-to-medium, both "close out a cross-cutting interface's local implementation") — there is no shared code or sequencing between them.

## Build this — `WI-EVT-003`

`RedisStreamsPublisher`/`RedisStreamsSubscriber` implementing the already-frozen `IEventPublisher`/`IEventSubscriber` (`tools/BakeryMarketplace.Eventing/`), using Redis Streams (`XADD`/`XREADGROUP` with consumer groups). Filter by `eventType` to match Event Grid's built-in filtering behavior — the local and cloud transports must be behaviorally equivalent, not just structurally similar. Add a dedicated dead-letter stream simulating Event Grid's dead-lettering after a configurable max-delivery-attempts count.

Must pass the existing `EventTransportContractTests` suite against a real local Redis Streams container. Envelope fields (`DomainEventEnvelope<T>`) pass through unmodified — this transport never reorders or rewrites content.

## Build this — `WI-AUTH-002`

A reusable `IAuthorizationRequirement` + handler composing a role-policy check (already built, `AUTH-001`) with an `IResourceOwnershipChecker` call (also already built) against a resource ID from the route. One fully worked reference example: `PUT /catalog/listings/{id}` — `Vendor` role + `listing.vendorId == sub`, per `docs/architecture/data-model-api-contracts.md`.

Deterministic tests only (same reasoning as `AUTH-001`/`AUTH-003` — auth has no fallback behavior to prove, so no chaos decorator applies here): authorized owner passes; wrong owner → 403; missing role claim → 403 *before* the ownership check even runs (role check short-circuits first).

**Do not** roll this pattern out to every other service's endpoints — each domain epic (`CAT-001`, etc.) applies it to its own resources when built. This item delivers the reusable pattern plus one reference wiring, not a project-wide rollout.

## Scope boundaries (read before touching code)

- **`EVT-003`**: does not implement `EventGridPublisher`/`Subscriber` (cloud, separate item, deprioritized) or `ChaosEventTransport` (separate item — this transport is what that chaos decorator will eventually wrap)
- **`AUTH-002`**: does not implement every service's endpoints — one reference example only
- **You do not need** the bakery domain itself for `EVT-003` (fully domain-agnostic, same as the interfaces it implements) or any service's business logic beyond "which field is the owner" for `AUTH-002`
- **You do not need** to know about the pending Entra External ID swap (open item #21) — neither item is affected by it

## Where to look (pointers, not restated)

- `docs/architecture/adr/0003-event-driven-backbone.md`, `0006-auth-authz-model.md` — full design for each
- `tools/BakeryMarketplace.Eventing/IEventPublisher.cs`, `IEventSubscriber.cs`, `DomainEventEnvelope.cs` — the frozen contracts
- `tools/BakeryMarketplace.Auth/IResourceOwnershipChecker.cs`, `AuthServiceExtensions.cs` — already-built pieces this composes with
- `tools/tests/BakeryMarketplace.Eventing.Tests/EventTransportContractTests.cs` — the suite you must pass

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`). No item-specific addition beyond what's already stated above (passing the contract suite; the short-circuit ordering test for `AUTH-002`).
