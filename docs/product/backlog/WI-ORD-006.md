```
WI ID:               ORD-006
Title:                Order persistence via Repository<T>
Type:                 Integration
Epic:                 EPIC-ORDERING
Shared with epic(s):  none
Hat/Owner:            Engineering/Build
Status:               Ready
Size:                 S
```

**Context / Why**
`ORD-002`'s aggregate is in-memory only; ADR-0004 requires all Cosmos access through `Repository<T>`. This item wires the Order aggregate to `CosmosRepository<Order>` against the `orders` container.

**Inputs / References**
- *Decisions*: ADR-0004 (`orders` container, `customerId` partition key, Session consistency)
- *Interfaces*: `IRepository<T>` / `CosmosRepository<T>` (`DATA-002`), `Order` aggregate (`ORD-002`)
- *Environment/tooling*: local Cosmos emulator (`DEV-001`)
- *Test/chaos methodology*: reuses `RepositoryContractTests<T>` pattern applied to `Order` specifically
- *Business context*: `data-model-api-contracts.md`

**You do not need to know about**
- Any other container's persistence — this item is `orders` only

**Out of scope**
- Does not implement `order-status-readmodel` persistence (`QUE-001`'s job, a distinct container per ADR-0004's CQRS split)

**Requirements / Acceptance Criteria**
- `Order` persisted/retrieved via `IRepository<Order>` (`CosmosRepository<Order>` in real use, `FakeRepository<Order>` in unit tests), partitioned by `customerId`
- Save-then-get round-trips every field including nested `lineItems` and `fulfillmentDetails`
- No direct Cosmos SDK usage outside the repository abstraction anywhere in this item's code

**Dependencies**
- Blocked by: `ORD-002`, `DATA-002`
- Can be worked in parallel with: `ORD-005`

**Definition of Done**
See `docs/process/definition-of-done.md`.

**AI-agent suitability**
Yes.

**Systems/contexts being integrated**: `ordering-service` ↔ Cosmos DB (`orders` container)
**Contract being relied on**: `IRepository<T>`'s shape (`DATA-002`) not changing without notice

**Open Points (working)**
*(none currently)*
