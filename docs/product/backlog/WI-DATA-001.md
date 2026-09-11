```
WI ID:               DATA-001
Title:                Define IRepository<T> interface + contract tests
Type:                 Interface/Contract
Epic:                 EPIC-DATA-STORE
Shared with epic(s):  none
Hat/Owner:            Platform Engineering
Status:               Ready
Size:                 S
```

**Context / Why**
ADR-0004 establishes container-per-bounded-context Cosmos DB access via a `Repository<T>` interface, with a `FakeRepository<T>` for fast unit tests and contract tests run against the real Cosmos emulator for integration fidelity. This item defines the interface in real C# (per ADR-0010) and its contract tests — it doesn't implement `CosmosRepository<T>` itself (separate item, not yet detailed).

**Inputs / References**
- *Decisions*: `docs/architecture/adr/0004-data-store-choice.md` (the full design), ADR-0010 (C#/.NET, `Microsoft.Azure.Cosmos` SDK, xUnit contract-test pattern)
- *Interfaces*: none consumed — this item defines one
- *Environment/tooling*: `docs/architecture/data-model-api-contracts.md` (the concrete document shapes each container-specific repository will store)
- *Test/chaos methodology*: same adapter + contract-test pattern as `CACHE-001`/`EVT-001`
- *Business context*: none needed beyond the shapes already in `data-model-api-contracts.md`

**You do not need to know about**
- Any specific document type's business rules (Listing, Order, etc.) — this interface is generic over `T`, business logic lives in the services that use it
- Cosmos emulator setup specifics — that's a separate Infra/Environment item

**Out of scope**
- Does not implement `CosmosRepository<T>` (separate item, not yet detailed)
- Does not implement `FakeRepository<T>` beyond what's needed to prove the contract tests pass against something — a minimal in-memory implementation is fine as the test-double reference, full-featured fake is not required here
- Does not decide partition key values per container — already stated in `data-model-api-contracts.md`, this interface just accepts one as a parameter

**Requirements / Acceptance Criteria**
- Interface (C#, per ADR-0010):
```csharp
public interface IRepository<T> where T : class
{
    Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default);
    Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default);
    Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default);
    IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        CancellationToken ct = default);
}
```
- `QueryAsync`'s `Func<IQueryable<T>, IQueryable<T>>` parameter is the injection-protection mechanism per `nfrs.md` §3.4 — it composes LINQ expressions the Cosmos SDK translates safely, and must never be implemented by concatenating raw query strings
- A shared xUnit abstract test base class (`RepositoryContractTests<T>`) with an abstract factory for a test entity + repository pair, covering at minimum: save-then-get returns the entity; get on a missing id/partitionKey returns `null`, not a thrown exception; delete removes an entity such that a subsequent get returns `null`; query returns only entities matching the composed predicate within that partition

**Dependencies**
- Blocks: the (not yet detailed) `CosmosRepository<T>` implementation item
- Blocked by: none
- Can be worked in parallel with: `EVT-001`, `AUTH-001`, `CACHE-003`, `CACHE-004`

**Definition of Done**
See `docs/process/definition-of-done.md`. Item-specific addition: verify `QueryAsync`'s signature genuinely prevents raw string query construction — this is the concrete enforcement point for the NFR baseline, not just a convention.

**AI-agent suitability**
Yes. Fully specified by ADR-0004 plus the C# signatures above and the existing document shapes in `data-model-api-contracts.md`; no open judgment calls.

**Open Points (working)**
*(none currently)*
