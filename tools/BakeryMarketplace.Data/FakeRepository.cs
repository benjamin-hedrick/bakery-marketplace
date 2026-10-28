using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace BakeryMarketplace.Data;

/// <summary>
/// Minimal in-memory implementation of <see cref="IRepository{T}"/> for use in unit tests.
/// This is the reference test-double; it is NOT intended for production use.
/// The contract-test suite runs against this implementation to validate the suite itself is sound.
/// See ADR-0004 for the data store design.
/// <para>
/// Entities that implement <see cref="IETagged"/> behave like a real store: every save gives the stored copy a new ETag, reads return
/// independent copies (so two readers cannot see each other's edits), and <see cref="SaveIfUnchangedAsync"/> enforces the precondition.
/// Other entity types keep the original simple behaviour (the stored reference is shared).
/// </para>
/// </summary>
public sealed class FakeRepository<T> : IRepository<T> where T : class
{
    private static readonly bool Tagged = typeof(IETagged).IsAssignableFrom(typeof(T));

    // key: (id, partitionKey) → entity
    private readonly ConcurrentDictionary<(string Id, string PartitionKey), T> _store = new();
    private readonly object _gate = new();

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
        lock (_gate)
        {
            _store.TryGetValue((id, partitionKey), out var entity);
            return Task.FromResult(entity is null ? null : Copy(entity));
        }
    }

    public Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        lock (_gate)
        {
            return Task.FromResult(Store(entity, partitionKey));
        }
    }

    public Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        if (!Tagged) throw new NotSupportedException($"{typeof(T).Name} does not implement IETagged, so it cannot be saved conditionally.");

        lock (_gate)
        {
            var key = (_idSelector(entity), partitionKey);
            var expected = ((IETagged)entity).ETag;
            var exists = _store.TryGetValue(key, out var current);

            if (string.IsNullOrEmpty(expected))
            {
                if (exists) return Task.FromResult<T?>(null); // already created by someone else
            }
            else if (!exists || ((IETagged)current!).ETag != expected)
            {
                return Task.FromResult<T?>(null); // changed or deleted since it was read
            }

            return Task.FromResult<T?>(Store(entity, partitionKey));
        }
    }

    public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        lock (_gate)
        {
            _store.TryRemove((id, partitionKey), out _);
        }
        return Task.CompletedTask;
    }

    public async IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        List<T> results;
        lock (_gate)
        {
            // Collect all entities in the partition, then apply the LINQ expression in-memory.
            var partition = _store
                .Where(kv => kv.Key.PartitionKey == partitionKey)
                .Select(kv => kv.Value)
                .AsQueryable();

            results = query(partition).ToList().Select(Copy).ToList();
        }

        foreach (var item in results)
        {
            ct.ThrowIfCancellationRequested();
            yield return item;
            await Task.Yield(); // make it genuinely async
        }
    }

    /// <summary>Stores the entity (a copy, for tagged types) with a fresh ETag and returns what was stored. Caller holds the lock.</summary>
    private T Store(T entity, string partitionKey)
    {
        var id = _idSelector(entity);
        if (!Tagged)
        {
            _store[(id, partitionKey)] = entity;
            return entity;
        }

        var stored = Copy(entity);
        ((IETagged)stored).ETag = Guid.NewGuid().ToString("N");
        _store[(id, partitionKey)] = stored;
        return Copy(stored);
    }

    private static T Copy(T entity) =>
        Tagged ? JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(entity))! : entity;
}
