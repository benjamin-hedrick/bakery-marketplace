namespace BakeryMarketplace.Data;

/// <summary>
/// Several writes to one partition that succeed or fail together (a Cosmos transactional batch). The items can be of different types,
/// which is what lets a stock reservation decrement several listings and write its own record in one step (ADR-0017, WI-CAT-006).
/// Every item must be in the partition the batch was created for. A batch holds at most <see cref="MaxOperations"/> operations.
/// </summary>
public interface IPartitionBatch
{
    public const int MaxOperations = 100;

    /// <summary>Adds a new item. The batch fails if an item with that id already exists in the partition.</summary>
    IPartitionBatch Create<T>(T entity) where T : class, IETagged;

    /// <summary>Replaces an item, only if its stored ETag still equals <see cref="IETagged.ETag"/>; the batch fails otherwise.</summary>
    IPartitionBatch ReplaceIfUnchanged<T>(T entity) where T : class, IETagged;

    /// <summary>
    /// Applies all operations or none. Returns <c>true</c> when everything was applied, and <c>false</c> when a precondition failed
    /// (an ETag changed, an item to create already exists, or an item to replace is gone), in which case nothing was applied and the
    /// caller re-reads and decides. Any other failure throws.
    /// </summary>
    Task<bool> ExecuteAsync(CancellationToken ct = default);
}

public interface IBatchFactory
{
    IPartitionBatch CreateBatch(string partitionKey);
}
