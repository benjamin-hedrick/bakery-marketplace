using System.Collections.Concurrent;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace BakeryMarketplace.Data;

/// <summary>
/// In-memory implementation of <see cref="IRepository{T}"/>: the local-development backend (<c>Data:Backend=fake</c>) and the test double.
/// It is the reference implementation the contract tests are checked against; it is NOT intended for production use.
/// The contract-test suite runs against this implementation to validate the suite itself is sound.
/// See ADR-0004 for the data store design.
/// <para>
/// Entities that implement <see cref="IETagged"/> behave like a real store: every save gives the stored copy a new ETag, reads return
/// independent copies (so two readers cannot see each other's edits), and <see cref="SaveIfUnchangedAsync"/> enforces the precondition.
/// Other entity types keep the simple behaviour (the stored reference is shared).
/// </para>
/// </summary>
public sealed class FakeRepository<T> : IRepository<T> where T : class
{
    private static readonly bool Tagged = typeof(IETagged).IsAssignableFrom(typeof(T));

    // key: (id, partitionKey) → entity
    private readonly ConcurrentDictionary<(string Id, string PartitionKey), T> _store = new();
    private readonly object _gate;

    /// <summary>
    /// Extracts the entity's id. Implementations must set this via constructor or property.
    /// The Fake uses this to return the correct entity from SaveAsync.
    /// </summary>
    private readonly Func<T, string> _idSelector;

    /// <param name="idSelector">Reads the entity's id.</param>
    /// <param name="database">
    /// Repositories created with the same <see cref="FakeDatabase"/> share one lock and can take part in the same
    /// <see cref="FakeBatchFactory"/> batch. Omit it for a standalone repository.
    /// </param>
    public FakeRepository(Func<T, string> idSelector, FakeDatabase? database = null)
    {
        _idSelector = idSelector ?? throw new ArgumentNullException(nameof(idSelector));
        _gate = database?.Gate ?? new object();
        database?.Register(this);
    }

    // ---- used by FakeBatchFactory, always called with the shared lock held ----

    internal bool ExistsUnlocked(string id, string partitionKey) => _store.ContainsKey((id, partitionKey));

    internal bool IsUnchangedUnlocked(T entity, string partitionKey) =>
        _store.TryGetValue((_idSelector(entity), partitionKey), out var current)
        && ((IETagged)current).ETag == ((IETagged)entity).ETag;

    internal void StoreUnlocked(T entity, string partitionKey) => Store(entity, partitionKey);

    // Each operation yields before touching the store, like a real network call, so concurrent callers genuinely interleave in tests.
    // Without it every call completes synchronously and "concurrent" tests would run one request after another.
    public async Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate)
        {
            _store.TryGetValue((id, partitionKey), out var entity);
            return entity is null ? null : Copy(entity);
        }
    }

    public async Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate)
        {
            return Store(entity, partitionKey);
        }
    }

    public async Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        if (!Tagged) throw new NotSupportedException($"{typeof(T).Name} does not implement IETagged, so it cannot be saved conditionally.");

        await Task.Yield();
        lock (_gate)
        {
            var key = (_idSelector(entity), partitionKey);
            var expected = ((IETagged)entity).ETag;
            var exists = _store.TryGetValue(key, out var current);

            if (string.IsNullOrEmpty(expected))
            {
                if (exists) return null; // already created by someone else
            }
            else if (!exists || ((IETagged)current!).ETag != expected)
            {
                return null; // changed or deleted since it was read
            }

            return Store(entity, partitionKey);
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
            // Collect all entities in the partition (or in every partition when none is given), then apply the LINQ expression in-memory.
            var partition = _store
                .Where(kv => string.IsNullOrEmpty(partitionKey) || kv.Key.PartitionKey == partitionKey)
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
