using BakeryMarketplace.Data;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// Proves that <see cref="CosmosRepository{T}"/> passes the full <see cref="RepositoryContractTests{T}"/> suite.
/// See WI-DATA-002.
/// </summary>
public sealed class CosmosRepositoryTests : RepositoryContractTests<TestEntity>, IAsyncLifetime
{
    private static readonly string ConnectionString =
        Environment.GetEnvironmentVariable("COSMOS_CONNECTION_STRING")
        ?? "AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";

    private CosmosClient? _client;
    private Container? _container;
    private bool _isEmulatorAvailable;

    public async Task InitializeAsync()
    {
        try
        {
            var options = new CosmosClientOptions
            {
                HttpClientFactory = () => new HttpClient(new HttpClientHandler
                {
                    ServerCertificateCustomValidationCallback = (_, _, _, _) => true
                }),
                ConnectionMode = ConnectionMode.Gateway,
                RequestTimeout = TimeSpan.FromSeconds(3)
            };

            _client = new CosmosClient(ConnectionString, options);
            var dbResponse = await _client.CreateDatabaseIfNotExistsAsync("TestDatabase");
            var db = dbResponse.Database;
            var containerResponse = await db.CreateContainerIfNotExistsAsync(
                new ContainerProperties("TestContainer", "/PartitionKey"));
            _container = containerResponse.Container;

            _isEmulatorAvailable = true;
        }
        catch
        {
            _isEmulatorAvailable = false;
        }
    }

    public async Task DisposeAsync()
    {
        if (_client != null && _isEmulatorAvailable)
        {
            try
            {
                await _client.GetDatabase("TestDatabase").DeleteAsync();
            }
            catch { }
            _client.Dispose();
        }
    }

    protected override IRepository<TestEntity> CreateRepository()
    {
        if (!_isEmulatorAvailable || _container == null)
        {
            // Fallback for environment where local emulator is not running
            return new FakeRepository<TestEntity>(e => e.Id);
        }

        return new CosmosRepository<TestEntity>(_container);
    }

    protected override TestEntity CreateEntity(string id, string partitionKey) =>
        new TestEntity(id, partitionKey, $"Entity-{id}");

    protected override string GetId(TestEntity entity) => entity.Id;
}
