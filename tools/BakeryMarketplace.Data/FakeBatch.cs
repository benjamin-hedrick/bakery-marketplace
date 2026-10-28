using System.Collections.Concurrent;

namespace BakeryMarketplace.Data;

/// <summary>
/// A shared in-memory "database" for <see cref="FakeRepository{T}"/> instances. Repositories created with the same database take the same
/// lock, so <see cref="FakeBatchFactory"/> can apply a batch across several entity types atomically, like one Cosmos container.
/// </summary>
public sealed class FakeDatabase
{
    private readonly ConcurrentDictionary<Type, object> _repositories = new();

    internal object Gate { get; } = new();

    internal void Register<T>(FakeRepository<T> repository) where T : class => _repositories[typeof(T)] = repository;

    internal FakeRepository<T> For<T>() where T : class =>
        _repositories.TryGetValue(typeof(T), out var repository)
            ? (FakeRepository<T>)repository
            : throw new InvalidOperationException($"No FakeRepository<{typeof(T).Name}> was created with this FakeDatabase.");
}

/// <summary>In-memory <see cref="IBatchFactory"/> over a <see cref="FakeDatabase"/>. Checks every precondition under the lock, then applies everything or nothing.</summary>
public sealed class FakeBatchFactory(FakeDatabase database) : IBatchFactory
{
    public IPartitionBatch CreateBatch(string partitionKey) => new FakePartitionBatch(database, partitionKey ?? string.Empty);

    private sealed class FakePartitionBatch(FakeDatabase database, string partitionKey) : IPartitionBatch
    {
        private readonly List<(Func<bool> Check, Action Apply)> _operations = [];

        public IPartitionBatch Create<T>(T entity) where T : class, IETagged
        {
            Add();
            var repository = database.For<T>();
            _operations.Add((
                () => !repository.ExistsUnlocked(entity.Id, partitionKey),
                () => repository.StoreUnlocked(entity, partitionKey)));
            return this;
        }

        public IPartitionBatch ReplaceIfUnchanged<T>(T entity) where T : class, IETagged
        {
            Add();
            var repository = database.For<T>();
            _operations.Add((
                () => repository.IsUnchangedUnlocked(entity, partitionKey),
                () => repository.StoreUnlocked(entity, partitionKey)));
            return this;
        }

        public async Task<bool> ExecuteAsync(CancellationToken ct = default)
        {
            if (_operations.Count == 0) throw new InvalidOperationException("A batch needs at least one operation.");

            await Task.Yield(); // like a real round trip, so concurrent callers interleave
            lock (database.Gate)
            {
                if (!_operations.All(op => op.Check())) return false;
                foreach (var op in _operations) op.Apply();
                return true;
            }
        }

        private void Add()
        {
            if (_operations.Count >= IPartitionBatch.MaxOperations)
                throw new InvalidOperationException($"A batch can hold at most {IPartitionBatch.MaxOperations} operations.");
        }
    }
}
