using BakeryMarketplace.Data;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// Proves that <see cref="CosmosRepository{T}"/> passes the full <see cref="RepositoryContractTests{T}"/> suite on the real Cosmos SDK. See WI-DATA-002.
/// Without COSMOS_CONNECTION_STRING the tests are reported as skipped, never faked and never passed (register item 31); with it set and the emulator
/// unreachable they fail, with the connection error, because a run that asked for Cosmos must not quietly test something else.
/// For the local vNext emulator: <c>AccountEndpoint=http://localhost:8081/;AccountKey=...</c>.
/// </summary>
public sealed class CosmosRepositoryTests : RepositoryContractTests<TestEntity>, IAsyncLifetime
{
    private CosmosClient? _client;
    private Container? _container;

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        var options = new CosmosClientOptions
        {
            HttpClientFactory = () => new HttpClient(new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (_, _, _, _) => true
            }),
            ConnectionMode = ConnectionMode.Gateway,
            RequestTimeout = TimeSpan.FromSeconds(3)
        };

        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, options);
        var dbResponse = await _client.CreateDatabaseIfNotExistsAsync("TestDatabase");
        var containerResponse = await dbResponse.Database.CreateContainerIfNotExistsAsync(
            new ContainerProperties("TestContainer", "/PartitionKey"));
        _container = containerResponse.Container;
    }

    public async Task DisposeAsync()
    {
        if (_client == null) return;
        try
        {
            await _client.GetDatabase("TestDatabase").DeleteAsync();
        }
        catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    protected override IRepository<TestEntity> CreateRepository() =>
        new CosmosRepository<TestEntity>(_container ?? throw new InvalidOperationException("Cosmos emulator not configured."));

    protected override TestEntity CreateEntity(string id, string partitionKey) =>
        new TestEntity(id, partitionKey, $"Entity-{id}");

    protected override string GetId(TestEntity entity) => entity.Id;

    [EmulatorFact] public Task SaveThenGet_ReturnsEntity() => Run_SaveThenGet_ReturnsEntity();
    [EmulatorFact] public Task GetMissingId_ReturnsNull_NotException() => Run_GetMissingId_ReturnsNull_NotException();
    [EmulatorFact] public Task DeleteThenGet_ReturnsNull() => Run_DeleteThenGet_ReturnsNull();
    [EmulatorFact] public Task Query_ReturnsOnlyMatchingEntitiesInPartition() => Run_Query_ReturnsOnlyMatchingEntitiesInPartition();

    protected override System.Linq.Expressions.Expression<Func<TestEntity, bool>> IdStartsWith(string prefix) =>
        e => e.Id.StartsWith(prefix);
}
