# Delegation Packet 02 — Concrete Adapter Implementations (Cosmos, Redis)

> **Status:** Historical · moved 2026-10-30 from `docs/product/backlog/delegation-packets/`. September 2026 packets handed to AI agents, kept as a record of how work was delegated then; the October work was done in interactive slices instead. The text is unchanged; relative links in it no longer work.

**Item(s) covered**: `WI-DATA-002` (`CosmosRepository<T>`), `WI-CACHE-002` (`RedisCacheProvider`)
**Full specs**: `docs/product/backlog/WI-DATA-002.md`, `WI-CACHE-002.md` — condensed here; those files win on conflict.
**AI-agent suitability**: Yes for both, no open judgment calls in either source spec.
**Delegation wave**: independent of every other packet in this round, and of each other — no shared code between the two, paired here only because both are "write the concrete implementation behind an already-frozen interface," the same task shape.
**Why paired, not split**: if you're assigning both to the same agent, they're genuinely parallel — build in either order. If splitting across two agents, no coordination needed between them.

## Build this — `WI-DATA-002`

`CosmosRepository<T>` implementing the already-frozen `IRepository<T>` (`tools/BakeryMarketplace.Data/IRepository.cs`), using the `Microsoft.Azure.Cosmos` SDK directly (no ORM). Must pass the existing `RepositoryContractTests<T>` suite against the local Cosmos emulator, not just `FakeRepository<T>`.

**Hard requirement, not a preference**: `QueryAsync` composes the `Func<IQueryable<T>, IQueryable<T>>` parameter against the SDK's LINQ provider. No raw string query construction anywhere — this is the actual enforcement point for this project's injection-protection baseline (`docs/architecture/nfrs.md` §3.4), not a style choice.

One constructor per container per `docs/architecture/data-model-api-contracts.md` (six containers: `catalog`, `orders`, `order-status-readmodel`, `vendors`, `preferences`, `reviews`, `payouts`) — partition keys are already specified there, don't re-derive them.

## Build this — `WI-CACHE-002`

`RedisCacheProvider` implementing the already-frozen `ICacheProvider` (`tools/BakeryMarketplace.Caching/ICacheProvider.cs`) via `StackExchange.Redis`. Must pass the existing `CacheProviderContractTests` suite against a real local Redis container (`docker-compose --profile with-redis up`).

TTL via Redis's native expiry (not emulated). Serialize with `System.Text.Json`, matching `CacheResult<T>`'s Found/Value contract exactly. Connection config via `CACHE_BACKEND=redis` + a connection string — not hardcoded.

**Do not** touch `ResilientCacheProvider` or `ChaosCacheProvider` — both already built and passing their own tests; this item only adds a new primary they can wrap.

## Scope boundaries (read before touching code)

- **`DATA-002`**: does not provision the Cosmos account itself (Terraform, separate item) or decide partition keys (already decided, see above)
- **`CACHE-002`**: does not build the Terraform `enable_managed_redis` toggle (`CACHE-005` — held, see `docs/governance/open-items-register.md` #22) — that's the *cloud* vendor question; this item's local Redis-protocol work is fully unblocked regardless
- **You do not need** any domain/business logic context for either — both are pure adapter implementations behind interfaces that are already frozen and reviewed

## Where to look (pointers, not restated)

- `docs/architecture/adr/0004-data-store-choice.md`, `0002-cache-strategy.md` — full design for each
- `tools/BakeryMarketplace.Data/IRepository.cs`, `tools/BakeryMarketplace.Caching/ICacheProvider.cs` — the frozen contracts
- `tools/tests/BakeryMarketplace.Data.Tests/RepositoryContractTests.cs`, `tools/tests/BakeryMarketplace.Caching.Tests/CacheProviderContractTests.cs` — the suites you must pass

## Definition of Done

Standard DoD (`docs/process/definition-of-done.md`) plus, per each item's own spec: `DATA-002` must pass its contract suite against the real emulator, not just the fake; `CACHE-002` must pass its suite against a real local Redis instance, not just in-memory.
