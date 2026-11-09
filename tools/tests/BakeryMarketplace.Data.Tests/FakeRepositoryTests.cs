using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// Simple entity used in data contract tests. Cosmos requires a lowercase <c>id</c> property, so the identifier is named explicitly,
/// as the service documents do (register item 31).
/// </summary>
public record TestEntity([property: JsonProperty("id")] string Id, string PartitionKey, string Name);

/// <summary>
/// Proves that <see cref="FakeRepository{T}"/> passes the full <see cref="RepositoryContractTests{T}"/> suite.
/// See WI-DATA-001.
/// </summary>
public sealed class FakeRepositoryTests : RepositoryContractTests<TestEntity>
{
    protected override IRepository<TestEntity> CreateRepository() =>
        new FakeRepository<TestEntity>(e => e.Id);

    protected override TestEntity CreateEntity(string id, string partitionKey) =>
        new TestEntity(id, partitionKey, $"Entity-{id}");

    protected override string GetId(TestEntity entity) => entity.Id;

    [Fact] public Task SaveThenGet_ReturnsEntity() => Run_SaveThenGet_ReturnsEntity();
    [Fact] public Task GetMissingId_ReturnsNull_NotException() => Run_GetMissingId_ReturnsNull_NotException();
    [Fact] public Task DeleteThenGet_ReturnsNull() => Run_DeleteThenGet_ReturnsNull();
    [Fact] public Task Query_ReturnsOnlyMatchingEntitiesInPartition() => Run_Query_ReturnsOnlyMatchingEntitiesInPartition();

    protected override System.Linq.Expressions.Expression<Func<TestEntity, bool>> IdStartsWith(string prefix) =>
        e => e.Id.StartsWith(prefix);
}
