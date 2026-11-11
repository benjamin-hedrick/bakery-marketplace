using System.Net;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data;

/// <summary>Cosmos implementation of <see cref="IBatchFactory"/>: a transactional batch on one container and partition.</summary>
public sealed class CosmosBatchFactory : IBatchFactory
{
    private readonly Container _container;

    public CosmosBatchFactory(Container container)
    {
        ArgumentNullException.ThrowIfNull(container);
        _container = container;
    }

    public CosmosBatchFactory(CosmosClient client, string databaseName, string containerName)
        : this(client.GetContainer(databaseName, containerName))
    {
    }

    public IPartitionBatch CreateBatch(string partitionKey) =>
        new CosmosPartitionBatch(_container.CreateTransactionalBatch(new PartitionKey(partitionKey ?? string.Empty)));

    private sealed class CosmosPartitionBatch(TransactionalBatch batch) : IPartitionBatch
    {
        private int _operations;

        public IPartitionBatch Create<T>(T entity) where T : class, IETagged
        {
            Count();
            batch.CreateItem(entity);
            return this;
        }

        public IPartitionBatch ReplaceIfUnchanged<T>(T entity) where T : class, IETagged
        {
            Count();
            batch.ReplaceItem(entity.Id, entity, new TransactionalBatchItemRequestOptions { IfMatchEtag = entity.ETag });
            return this;
        }

        public async Task<bool> ExecuteAsync(CancellationToken ct = default)
        {
            if (_operations == 0) throw new InvalidOperationException("A batch needs at least one operation.");

            TransactionalBatchResponse response;
            try
            {
                response = await batch.ExecuteAsync(ct);
            }
            catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
            {
                throw StoreUnavailableException.From(ex);
            }

            using var _ = response;
            if (response.IsSuccessStatusCode) return true;

            // When a batch fails, the operation that failed carries the real status and the rest are 424 (failed dependency).
            var cause = Enumerable.Range(0, response.Count)
                .Select(i => response[i].StatusCode)
                .FirstOrDefault(code => code != HttpStatusCode.FailedDependency && (int)code >= 400, response.StatusCode);

            if (cause is HttpStatusCode.PreconditionFailed or HttpStatusCode.Conflict or HttpStatusCode.NotFound) return false;
            if (StoreUnavailableException.IsTransport(cause))
                throw new StoreUnavailableException($"The store could not be reached or did not answer in time (HTTP {(int)cause}).", cause);
            throw new InvalidOperationException($"The transactional batch failed with HTTP {(int)cause} ({response.ErrorMessage}).");
        }

        private void Count()
        {
            if (++_operations > IPartitionBatch.MaxOperations)
                throw new InvalidOperationException($"A batch can hold at most {IPartitionBatch.MaxOperations} operations.");
        }
    }
}
