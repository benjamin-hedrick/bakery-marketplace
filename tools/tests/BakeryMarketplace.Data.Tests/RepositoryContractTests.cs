using BakeryMarketplace.Data;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// Shared contract test suite for all <see cref="IRepository{T}"/> implementations.
/// A new implementation inherits by subclassing and providing its own CreateRepository() + factory.
/// See WI-DATA-001 acceptance criteria.
/// </summary>
public abstract class RepositoryContractTests<T> where T : class
{
    protected abstract IRepository<T> CreateRepository();
    protected abstract T CreateEntity(string id, string partitionKey);
    protected abstract string GetId(T entity);

    [Fact]
    public async Task SaveThenGet_ReturnsEntity()
    {
        // Arrange
        var repo = CreateRepository();
        var entity = CreateEntity("id-1", "partition-a");

        // Act
        await repo.SaveAsync(entity, "partition-a");
        var result = await repo.GetAsync(GetId(entity), "partition-a");

        // Assert
        Assert.NotNull(result);
        Assert.Equal(GetId(entity), GetId(result!));
    }

    [Fact]
    public async Task GetMissingId_ReturnsNull_NotException()
    {
        // Arrange
        var repo = CreateRepository();

        // Act — must NOT throw
        var result = await repo.GetAsync("nonexistent-id", "any-partition");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task DeleteThenGet_ReturnsNull()
    {
        // Arrange
        var repo = CreateRepository();
        var entity = CreateEntity("id-del", "partition-b");
        await repo.SaveAsync(entity, "partition-b");

        // Act
        await repo.DeleteAsync(GetId(entity), "partition-b");
        var result = await repo.GetAsync(GetId(entity), "partition-b");

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task Query_ReturnsOnlyMatchingEntitiesInPartition()
    {
        // Arrange
        var repo = CreateRepository();
        var entityA1 = CreateEntity("q-a1", "query-partition");
        var entityA2 = CreateEntity("q-a2", "query-partition");
        var entityB = CreateEntity("q-b1", "other-partition");
        await repo.SaveAsync(entityA1, "query-partition");
        await repo.SaveAsync(entityA2, "query-partition");
        await repo.SaveAsync(entityB, "other-partition");

        // Act — query within "query-partition" only
        var results = new List<T>();
        await foreach (var item in repo.QueryAsync(
            "query-partition",
            q => q.Where(e => GetId(e).StartsWith("q-a"))))
        {
            results.Add(item);
        }

        // Assert — only entities from "query-partition" matching the predicate
        Assert.Equal(2, results.Count);
        Assert.All(results, e => Assert.StartsWith("q-a", GetId(e)));
    }
}
