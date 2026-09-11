using System.Collections.Concurrent;
using System.Runtime.CompilerServices;

namespace BakeryMarketplace.Data;

/// <summary>
/// Minimal in-memory implementation of <see cref="IRepository{T}"/> for use in unit tests.
/// This is the reference test-double; it is NOT intended for production use.
/// The contract-test suite runs against this implementation to validate the suite itself is sound.
/// See ADR-0004 for the data store design.
/// </summary>
public sealed class FakeRepository<T> : IRepository<T> where T : class
{
    // key: (id, partitionKey) → entity
    private readonly ConcurrentDictionary<(string Id, string PartitionKey), T> _store = new();

    /// <summary>
    /// Extracts the entity's id. Implementations must set this via constructor or property.
    /// The Fake uses this to return the correct entity from SaveAsync.
    /// </summary>
    private readonly Func<T, string> _idSelector;

    public FakeRepository(Func<T, string> idSelector)
    {
        _idSelector = idSelector ?? throw new ArgumentNullException(nameof(idSelector));
    }

    public Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        _store.TryGetValue((id, partitionKey), out var entity);
        return Task.FromResult(entity);
    }

    public Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        var id = _idSelector(entity);
        _store[(id, partitionKey)] = entity;
        return Task.FromResult(entity);
    }

    public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        _store.TryRemove((id, partitionKey), out _);
        return Task.CompletedTask;
    }

    public async IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        // Collect all entities in the partition, then apply the LINQ expression in-memory.
        var partition = _store
            .Where(kv => kv.Key.PartitionKey == partitionKey)
            .Select(kv => kv.Value)
            .AsQueryable();

        var results = query(partition).ToList();

        foreach (var item in results)
        {
            ct.ThrowIfCancellationRequested();
            yield return item;
            await Task.Yield(); // make it genuinely async
        }
    }
}
