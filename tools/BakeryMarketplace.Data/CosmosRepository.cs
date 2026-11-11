using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;

namespace BakeryMarketplace.Data;

/// <summary>
/// Cosmos DB implementation of <see cref="IRepository{T}"/> using Microsoft.Azure.Cosmos SDK directly (no ORM).
/// See ADR-0004, ADR-0010, and WI-DATA-002.
/// </summary>
public class CosmosRepository<T> : IRepository<T> where T : class
{
    private readonly Container _container;

    public CosmosRepository(Container container)
    {
        _container = container ?? throw new ArgumentNullException(nameof(container));
    }

    public CosmosRepository(CosmosClient client, string databaseName, string containerName)
    {
        ArgumentNullException.ThrowIfNull(client);
        if (string.IsNullOrEmpty(databaseName)) throw new ArgumentException("Database name cannot be empty.", nameof(databaseName));
        if (string.IsNullOrEmpty(containerName)) throw new ArgumentException("Container name cannot be empty.", nameof(containerName));

        _container = client.GetContainer(databaseName, containerName);
    }

    public async Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(id)) throw new ArgumentException("Id cannot be null or empty.", nameof(id));

        try
        {
            ItemResponse<T> response = await _container.ReadItemAsync<T>(
                id,
                new PartitionKey(partitionKey ?? string.Empty),
                cancellationToken: ct);

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }

    public async Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(entity);

        try
        {
            ItemResponse<T> response = await _container.UpsertItemAsync<T>(
                entity,
                new PartitionKey(partitionKey ?? string.Empty),
                cancellationToken: ct);

            return response.Resource;
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }

    public async Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default)
    {
        if (entity is not IETagged tagged)
            throw new NotSupportedException($"{typeof(T).Name} does not implement IETagged, so it cannot be saved conditionally.");

        var key = new PartitionKey(partitionKey ?? string.Empty);
        try
        {
            ItemResponse<T> response = string.IsNullOrEmpty(tagged.ETag)
                ? await _container.CreateItemAsync(entity, key, cancellationToken: ct)
                : await _container.ReplaceItemAsync(
                    entity, tagged.Id, key, new ItemRequestOptions { IfMatchEtag = tagged.ETag }, ct);
            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode is HttpStatusCode.PreconditionFailed
                                             or HttpStatusCode.Conflict
                                             or HttpStatusCode.NotFound)
        {
            // Changed, created or deleted by someone else since it was read.
            return null;
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }

    public async Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(id)) throw new ArgumentException("Id cannot be null or empty.", nameof(id));

        try
        {
            await _container.DeleteItemAsync<T>(
                id,
                new PartitionKey(partitionKey ?? string.Empty),
                cancellationToken: ct);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            // Idempotent delete: ignore if not found
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }

    public async IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        var requestOptions = new QueryRequestOptions();
        if (!string.IsNullOrEmpty(partitionKey))
        {
            requestOptions.PartitionKey = new PartitionKey(partitionKey);
        }

        IQueryable<T> linqable = _container.GetItemLinqQueryable<T>(requestOptions: requestOptions);
        IQueryable<T> composedQuery = query(linqable);

        using FeedIterator<T> feedIterator = composedQuery.ToFeedIterator();

        while (feedIterator.HasMoreResults)
        {
            FeedResponse<T> response = await ReadNextAsync(feedIterator, ct);
            foreach (T item in response)
            {
                yield return item;
            }
        }
    }

    private static async Task<FeedResponse<T>> ReadNextAsync(FeedIterator<T> iterator, CancellationToken ct)
    {
        try
        {
            return await iterator.ReadNextAsync(ct);
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }
}
