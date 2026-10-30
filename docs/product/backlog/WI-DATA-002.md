> **Status:** Done · evidence: `tools/BakeryMarketplace.Data` (Cosmos repository) and its tests

```
WI ID:               DATA-002
Title:                CosmosRepository<T> implementation
Type:                 Service Implementation
Epic:                 EPIC-DATA-STORE
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Done
Size:                 M
```

**Context / Why**
`DATA-001` defines `IRepository<T>` and its contract-test suite; ADR-0004 requires the real implementation to use the `Microsoft.Azure.Cosmos` SDK directly (no ORM, per ADR-0010), LINQ/parameterized queries only (`nfrs.md` §3.4). This item builds that implementation so it can pass `DATA-001`'s contract suite and back real local (emulator) and eventual cloud use.

**Inputs / References**
- *Decisions*: ADR-0004 (data store design), ADR-0010 (Cosmos SDK, no ORM), `nfrs.md` §3.4 (injection-protection baseline)
- *Interfaces*: `IRepository<T>` (`DATA-001`)
- *Environment/tooling*: Cosmos DB Linux emulator (default Compose service, per `tech-stack.md`); `data-model-api-contracts.md` for concrete container/partition-key mapping
- *Test/chaos methodology*: `RepositoryContractTests<T>` (`DATA-001`) — this implementation must pass it
- *Business context*: none beyond the container shapes already documented

**You do not need to know about**
- Any specific service's business logic beyond the document shapes already defined
- Terraform Cosmos account provisioning (`DATA-004`, separate)

**Out of scope**
- Does not implement `FakeRepository<T>` further (already exists, from `DATA-001`)
- Does not provision the Cosmos account itself (`DATA-004`)
- Does not decide partition keys — already stated in `data-model-api-contracts.md`

**Requirements / Acceptance Criteria**
- `CosmosRepository<T>` implements `IRepository<T>` using the Cosmos SDK's typed container client
- `QueryAsync` composes the `Func<IQueryable<T>, IQueryable<T>>` against the SDK's LINQ provider — no raw string query construction anywhere, per `nfrs.md` §3.4
- `GetAsync` returns `null` (not a thrown exception) on a Cosmos 404/NotFound, matching the contract
- Constructor takes a `Container` (or `CosmosClient` + container name) + partition-key path, generic over `T` — one instance per bounded-context container per `data-model-api-contracts.md`
- Passes the full `RepositoryContractTests<T>` suite when pointed at the local Cosmos emulator

**Dependencies**
- Blocks: `SEC-002` (Cosmos managed-identity wiring needs this to exist)
- Blocked by: `DATA-001` (done)
- Can be worked in parallel with: `CACHE-002`, `EVT-003`, `AUTH-002`, `AUTH-005`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: must pass the contract suite against the real emulator, not just `FakeRepository`, before merge.

**AI-agent suitability**
Yes — fully specified by ADR-0004 plus `DATA-001`'s contract; no open judgment calls.

**Interfaces consumed**: none new (implements `IRepository<T>`, doesn't consume another custom interface)
**Events published/consumed**: none
**Data touched**: all six containers per `data-model-api-contracts.md` (`catalog`, `orders`, `order-status-readmodel`, `vendors`, `preferences`, `reviews`, `payouts`)

**Open Points (working)**
*(none currently)*
