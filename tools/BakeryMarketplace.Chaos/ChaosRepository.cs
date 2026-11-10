using System.Net;
using System.Runtime.CompilerServices;
using BakeryMarketplace.Data;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The <c>repository</c> layer (ADR-0024): a decorator around any <see cref="IRepository{T}"/> that injects a transient store failure
/// (<c>failureRate</c>, thrown as the 503 the Cosmos SDK would throw), an optimistic-concurrency conflict on a conditional save
/// (<c>conflictRate</c>: the save is not made and <c>null</c> is returned, as the contract says for a changed document), slowness
/// (<c>latencyMs</c>) and an outage window. Decisions are keyed by the operation, the entity type, the partition and the attempt number.
/// It must pass the shared repository contract suite with every setting off.
/// </summary>
public sealed class ChaosRepository<T> : IRepository<T> where T : class
{
    public const string LayerName = "repository";

    private readonly IRepository<T> _inner;
    private readonly ChaosLayer _layer;

    public ChaosRepository(IRepository<T> inner, ChaosRuntime runtime)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(LayerName);
    }

    internal static Exception StoreFailure() =>
        new CosmosException("ChaosRepository: simulated transient store failure.", HttpStatusCode.ServiceUnavailable, 0, string.Empty, 0);

    /// <summary>The write was made, the answer never arrived (a request timeout).</summary>
    internal static Exception LostResponse() =>
        new CosmosException("ChaosRepository: the write was made but the response was lost.", HttpStatusCode.RequestTimeout, 0, string.Empty, 0);

    private static string EntityKey(string partitionKey) => $"{typeof(T).Name}/{partitionKey}";

    private Task Before(string operation, string partitionKey, CancellationToken ct) =>
        _layer.BeforeAsync(operation, $"{typeof(T).Name}/{partitionKey}", "failure", "failureRate", StoreFailure, ct);

    public async Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        await Before("get", partitionKey, ct);
        return await _inner.GetAsync(id, partitionKey, ct);
    }

    public async Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        await Before("save", partitionKey, ct);
        var saved = await _inner.SaveAsync(entity, partitionKey, ct);
        if (_layer.LostResponse("save", EntityKey(partitionKey))) throw LostResponse();
        return saved;
    }

    public async Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        await Before("saveIfUnchanged", partitionKey, ct);
        if (_layer.InjectAttempt("saveIfUnchanged", $"{typeof(T).Name}/{partitionKey}", "conflict", "conflictRate"))
            return null; // the document "changed": nothing is saved
        var saved = await _inner.SaveIfUnchangedAsync(entity, partitionKey, ct);
        if (saved is not null && _layer.LostResponse("saveIfUnchanged", EntityKey(partitionKey))) throw LostResponse();
        return saved;
    }

    public async Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        await Before("delete", partitionKey, ct);
        await _inner.DeleteAsync(id, partitionKey, ct);
        if (_layer.LostResponse("delete", EntityKey(partitionKey))) throw LostResponse();
    }

    public async IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await Before("query", partitionKey, ct);
        await foreach (var item in _inner.QueryAsync(partitionKey, query, ct).WithCancellation(ct))
            yield return item;
    }
}

/// <summary>The same layer for transactional batches: a batch can fail, or lose its optimistic-concurrency check (<c>ExecuteAsync</c> returns false).</summary>
public sealed class ChaosBatchFactory : IBatchFactory
{
    private readonly IBatchFactory _inner;
    private readonly ChaosLayer _layer;

    public ChaosBatchFactory(IBatchFactory inner, ChaosRuntime runtime)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(ChaosRepository<object>.LayerName);
    }

    public IPartitionBatch CreateBatch(string partitionKey) => new ChaosBatch(_inner.CreateBatch(partitionKey), _layer, partitionKey);

    private sealed class ChaosBatch(IPartitionBatch inner, ChaosLayer layer, string partitionKey) : IPartitionBatch
    {
        public IPartitionBatch Create<T>(T entity) where T : class, IETagged
        {
            inner.Create(entity);
            return this;
        }

        public IPartitionBatch ReplaceIfUnchanged<T>(T entity) where T : class, IETagged
        {
            inner.ReplaceIfUnchanged(entity);
            return this;
        }

        public async Task<bool> ExecuteAsync(CancellationToken ct = default)
        {
            await layer.BeforeAsync("batch", partitionKey, "failure", "failureRate", ChaosRepository<object>.StoreFailure, ct);
            if (layer.InjectAttempt("batch", partitionKey, "conflict", "conflictRate"))
                return false; // the optimistic-concurrency check "failed": nothing was written
            var applied = await inner.ExecuteAsync(ct);
            if (applied && layer.LostResponse("batch", partitionKey)) throw ChaosRepository<object>.LostResponse();
            return applied;
        }
    }
}
