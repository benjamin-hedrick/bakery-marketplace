namespace BakeryMarketplace.Data;

/// <summary>
/// Adapter interface for data store backends (Cosmos DB, in-memory fake, etc.).
/// See ADR-0004 for the container-per-bounded-context data store design.
///
/// QueryAsync deliberately accepts a LINQ expression composer rather than a raw query string —
/// this is the structural enforcement of the injection-protection baseline from nfrs.md §3.4.
/// It is not possible to build a raw-string query through this interface.
/// </summary>
public interface IRepository<T> where T : class
{
    /// <summary>Returns null (not a thrown exception) when the entity does not exist.</summary>
    Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default);

    Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default);

    /// <summary>
    /// Optimistic concurrency for entities that implement <see cref="IETagged"/>: saves only if the stored entity still has the
    /// <see cref="IETagged.ETag"/> the caller read. An entity with no ETag is created, and fails if one already exists.
    /// Returns the saved entity (with its new ETag), or <c>null</c> when the precondition failed because someone else changed
    /// (or created, or deleted) it first; the caller re-reads and retries. A plain <see cref="SaveAsync"/> still overwrites
    /// unconditionally and also changes the ETag, so a stale conditional save after it fails.
    /// Throws <see cref="NotSupportedException"/> for an implementation or entity type that does not support it.
    /// </summary>
    Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default) =>
        throw new NotSupportedException($"{GetType().Name} does not support conditional saves.");

    Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default);

    /// <summary>
    /// Returns entities within <paramref name="partitionKey"/> matching the composed predicate.
    /// The <paramref name="query"/> function receives an IQueryable and returns a filtered/ordered IQueryable.
    /// The implementation translates this to a safe, parameterized store query — never raw string concatenation.
    /// An empty <paramref name="partitionKey"/> queries across ALL partitions (as <see cref="CosmosRepository{T}"/> and the fake both do). That costs more than a single-partition query: use it for background maintenance, such as sweeping for pending outbox
    /// events, never on a request path.
    /// </summary>
    IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        CancellationToken ct = default);
}
