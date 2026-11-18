using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;

namespace BakeryMarketplace.Data;

/// <summary>
/// Cosmos DB implementation of <see cref="IRepository{T}"/> using Microsoft.Azure.Cosmos SDK directly (no ORM).
/// See ADR-0004, ADR-0010, and WI-DATA-002.
/// <para>
/// Reads can carry a time limit (register 206): with the store unreachable, the SDK retries a refused connection on its own schedule, 13 to 38 s
/// and once over 5 minutes, and no client option shortens it. A read (a point read, or one page of a query) that has not answered within the
/// limit is cancelled and reported as <see cref="StoreUnavailableException"/>, like any other failure to reach the store. Writes have no limit:
/// a write cancelled on our side may still be applied by the store, so its outcome would be unknown (the lead chose reads only, 2026-11-18).
/// </para>
/// </summary>
public class CosmosRepository<T> : IRepository<T> where T : class
{
    private readonly Container _container;
    private readonly TimeSpan? _readTimeout;
    private readonly TimeProvider _time;

    /// <param name="container">The container.</param>
    /// <param name="readTimeout">The longest a read may take before it is reported as the store being unavailable; null for no limit.</param>
    /// <param name="timeProvider">The clock for the limit; tests pass a fake one.</param>
    public CosmosRepository(Container container, TimeSpan? readTimeout = null, TimeProvider? timeProvider = null)
    {
        _container = container ?? throw new ArgumentNullException(nameof(container));
        if (readTimeout is { } limit && limit <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(readTimeout), "A read time limit must be positive.");
        _readTimeout = readTimeout;
        _time = timeProvider ?? TimeProvider.System;
    }

    public CosmosRepository(CosmosClient client, string databaseName, string containerName, TimeSpan? readTimeout = null, TimeProvider? timeProvider = null)
        : this(ContainerOf(client, databaseName, containerName), readTimeout, timeProvider)
    {
    }

    private static Container ContainerOf(CosmosClient client, string databaseName, string containerName)
    {
        ArgumentNullException.ThrowIfNull(client);
        if (string.IsNullOrEmpty(databaseName)) throw new ArgumentException("Database name cannot be empty.", nameof(databaseName));
        if (string.IsNullOrEmpty(containerName)) throw new ArgumentException("Container name cannot be empty.", nameof(containerName));
        return client.GetContainer(databaseName, containerName);
    }

    /// <summary>
    /// Runs a read under the limit. The wait itself is bounded (<see cref="Task.WaitAsync(TimeSpan, TimeProvider, CancellationToken)"/>), because the
    /// SDK does not always honour a cancellation token (not while it initializes, found with a store that never answers); the SDK is still given a
    /// token, cancelled at the limit, in case it does. An abandoned read keeps running until the SDK gives up; its outcome is observed and dropped.
    /// The caller's own cancellation stays a cancellation.
    /// </summary>
    private async Task<TResult> WithinReadLimit<TResult>(Func<CancellationToken, Task<TResult>> read, CancellationToken ct)
    {
        if (_readTimeout is not { } limit) return await read(ct);

        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var task = read(stop.Token);
        try
        {
            return await task.WaitAsync(limit, _time, ct);
        }
        catch (TimeoutException ex)
        {
            throw TimedOut(ex);
        }
        finally
        {
            if (!task.IsCompleted)
            {
                await stop.CancelAsync();
                _ = task.ContinueWith(static t => _ = t.Exception, CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
            }
        }
    }

    private StoreUnavailableException TimedOut(Exception ex) =>
        new($"The store did not answer a read within {_readTimeout!.Value.TotalSeconds:0.###} s.", HttpStatusCode.RequestTimeout, ex);

    public async Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(id)) throw new ArgumentException("Id cannot be null or empty.", nameof(id));

        try
        {
            ItemResponse<T> response = await WithinReadLimit(
                token => _container.ReadItemAsync<T>(id, new PartitionKey(partitionKey ?? string.Empty), cancellationToken: token),
                ct);

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

    public IAsyncEnumerable<T> QueryAsync(
        string partitionKey,
        Func<IQueryable<T>, IQueryable<T>> query,
        CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(partitionKey);
        ArgumentNullException.ThrowIfNull(query);
        return RunQueryAsync(new QueryRequestOptions { PartitionKey = new PartitionKey(partitionKey) }, query, ct);
    }

    public IAsyncEnumerable<T> QueryAcrossPartitionsAsync(Func<IQueryable<T>, IQueryable<T>> query, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(query);
        return RunQueryAsync(new QueryRequestOptions(), query, ct);
    }

    private async IAsyncEnumerable<T> RunQueryAsync(
        QueryRequestOptions requestOptions,
        Func<IQueryable<T>, IQueryable<T>> query,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
    {
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

    /// <summary>One page of a query, under the read time limit (each page has the whole limit: a long result is not cut off for being long).</summary>
    private async Task<FeedResponse<T>> ReadNextAsync(FeedIterator<T> iterator, CancellationToken ct)
    {
        try
        {
            return await WithinReadLimit(iterator.ReadNextAsync, ct);
        }
        catch (Exception ex) when (StoreUnavailableException.IsTransportFailure(ex))
        {
            throw StoreUnavailableException.From(ex);
        }
    }
}
