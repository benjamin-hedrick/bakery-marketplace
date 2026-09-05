# ADR-0004: Primary Data Store — Azure Cosmos DB (SQL API), Container-per-Context

**Status:** Accepted

## Context

Most bounded contexts are naturally document-shaped: Catalog listings with nested modifiers, the Order aggregate with nested line items and status history, Vendor profiles, and Customer preference profiles all map cleanly to a document model without complex joins. `tech-stack.md` flagged Azure Cosmos DB vs. Azure SQL serverless as the open question.

Two constraints shape this more than the document-vs-relational question itself:
- **Azure allows only one free-tier Cosmos DB account per subscription** (1000 RU/s + 25GB). A strict "one database per bounded context" approach isn't free-tier-compatible.
- **Payments/payout reconciliation data** is the one place a document store's typical eventual/session consistency default is a worse fit than a ledger wants — even though the payment *processing* itself is being deferred to a third-party (buy-vs-build ADR, pending).

## Decision

**Azure Cosmos DB, SQL (Core) API**, one account, one database, **one container per bounded context** rather than one database per context:

| Container | Partition key (v1, provisional) | Consistency level |
|---|---|---|
| `catalog` | `vendorId` | Session (default) |
| `orders` | `customerId` | Session (default) |
| `vendors` | `vendorId` | Session (default) |
| `preferences` | `customerId` | Session (default) |
| `reviews` | `vendorId` | Session (default) |
| `payouts` | `vendorId` | **Strong** (higher RU cost, but low volume relative to catalog/search reads — judged acceptable) |

**Context isolation is enforced in code, not infrastructure**: each bounded context accesses only its own container(s) through a `Repository` interface (`OrderRepository`, `ListingRepository`, etc.). No context queries another's container directly, and no cross-container joins are used. This means the shared account is a cost optimization, not an architectural coupling — splitting a container into its own Cosmos account later is a deployment change, not a code change, if it's ever needed.

**Vendor-side order views (including the live order-queue display) do not query the `orders` container directly.** They build their own read model by subscribing to the domain events from ADR-0003 (`OrderPlaced`, `OrderCustomized`, etc.), consistent with how Admin/Moderation was already modeled as a read-model consumer in the bounded context map. This is a deliberate CQRS-style split, not an oversight — and it means the queue display has a small, real, event-delivery-bound lag behind the moment an order is actually placed, which is an accepted characteristic, not a bug to chase to zero.

**Same adapter/contract-test pattern as ADR-0002 and ADR-0003**, applied to data access:

```
Repository<T> (interface: get, save, query-by-partition)
 ├─ CosmosRepository<T>   — real Cosmos SQL API implementation
 └─ FakeRepository<T>     — in-memory, for fast unit tests

Contract test suite run against both, to catch behavioral drift
(e.g., query semantics, partial-update behavior)
```

**Local development** runs the Cosmos DB Linux emulator as a Compose service in the default set (same reasoning as the event backbone in ADR-0003 — a working data store is core function, not an optional layer). Unit tests use `FakeRepository` and never touch the emulator; integration tests run against the emulator specifically to validate real Cosmos query/partition behavior.

## Consequences

**Positive**
- Free-tier compatible while still giving each bounded context a logically isolated container
- Document model fits the majority of contexts without translation overhead
- The Repository abstraction means splitting containers into separate accounts later is a config/deploy change, not a rearchitecture
- Payments gets its consistency guarantee (Strong) without forcing the same cost onto high-volume, less-consistency-sensitive containers (catalog/search)

**Negative / accepted limitations**
- One shared Cosmos account for all contexts is a real compromise against "each bounded context owns its infrastructure" — accepted for cost reasons, mitigated by code-level isolation via Repository interfaces rather than infrastructure-level isolation
- Partition key choices are v1 assumptions, not validated under real load; a wrong partition key (e.g., a hot partition on a popular vendor) would need a documented migration, not just a config change — worth flagging as a known revisit item rather than a solved problem
- The Cosmos DB Linux emulator has partial API coverage and can be resource-heavy locally; the Repository/FakeRepository split keeps the fast dev loop independent of it, but integration-test fidelity is only as good as the emulator's parity with real Cosmos
- Vendor-side order views being eventually consistent (via events, not direct query) means there's a real, if small, delay before a new order appears on the queue display — bounded by the event backbone's delivery characteristics from ADR-0003, not instantaneous

## Alternatives considered

1. **Azure SQL serverless, single relational database.** Rejected as primary store — most contexts don't need relational joins, and a single shared relational schema across contexts risks exactly the shared-database anti-pattern DDD is trying to avoid. Remains worth reconsidering specifically for `payouts` if Strong-consistency Cosmos costs become a real problem at scale.
2. **One Cosmos account per bounded context.** Rejected for v1 — not compatible with the single free-tier account constraint; would require paying for every context immediately, which conflicts with the free-tier-first principle.
3. **A single shared container for all contexts (one big collection).** Rejected — would make code-level isolation harder to enforce and partition-key design far messier across unrelated aggregate shapes.
4. **Using Cosmos DB's Change Feed as the event-publishing mechanism**, instead of the explicit domain events from ADR-0003. Rejected — would blur business-meaningful domain events with technical CRUD diffs, and would couple the event backbone to this specific data store choice rather than keeping it swappable.

## Related

- `tech-stack.md` — free-tier-first principle; this ADR resolves the "Pending ADR" data store row
- ADR-0001 — same "isolate now, allow splitting later" posture as the Fulfillment ACL
- ADR-0002 / ADR-0003 — same adapter + contract-test pattern reused for data access
- Bounded context map — container-per-context boundaries mirror the context map directly; vendor-side read models confirm the CQRS pattern already used for Admin/Moderation
