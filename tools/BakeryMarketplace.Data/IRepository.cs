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

    Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default);

    /// <summary>
    /// Returns entities within <paramref name="partitionKey"/> matching the composed predicate.
    /// The <paramref name="query"/> function receives an IQueryable and returns a filtered/ordered IQueryable.
    /// The implementation translates this to a safe, parameterized store query — never raw string concatenation.
    /// </summary>
    IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        CancellationToken ct = default);
}
