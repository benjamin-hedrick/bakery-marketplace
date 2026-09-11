using BakeryMarketplace.Data;

namespace BakeryMarketplace.Data.Tests;

/// <summary>Simple entity used in data contract tests.</summary>
public record TestEntity(string Id, string PartitionKey, string Name);

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
}
