using System.Net;
using BakeryMarketplace.Chaos;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// ADR-0024 gap closed: the repository chaos layer over the real Cosmos SDK, not only over the in-memory fake. Needs COSMOS_CONNECTION_STRING
/// (reported as skipped without it, never faked). What this shows that the fake cannot: that the lost-response fault leaves the item in the real store,
/// and that a real conditional create answers "already there" to the replay, as the checkout's idempotency relies on.
/// </summary>
public sealed class CosmosChaosTests : IAsyncLifetime
{
    private CosmosClient? _client;
    private Container? _container;
    private readonly string _database = "chaos-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        _container = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("items", "/PartitionKey"))).Container;
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    private (IRepository<VersionedEntity> Chaos, IRepository<VersionedEntity> Direct, ChaosRuntime Runtime) Build(params (string Setting, double Value)[] settings)
    {
        var direct = new CosmosRepository<VersionedEntity>(_container ?? throw new InvalidOperationException("Cosmos emulator not configured."));
        var runtime = RepositoryChaos.Runtime(1, settings);
        return (new ChaosRepository<VersionedEntity>(direct, runtime), direct, runtime);
    }

    private static VersionedEntity Entity(string id) => new() { Id = id, PartitionKey = "p", Name = "n" };

    [EmulatorFact]
    public async Task AFailedWrite_NeverReachesTheRealStore()
    {
        var (chaos, direct, runtime) = Build(("failureRate", 1));

        await Assert.ThrowsAsync<StoreUnavailableException>(() => chaos.SaveIfUnchangedAsync(Entity("a"), "p"));

        Assert.Equal(1, runtime.Journal.Count("repository", "failure"));
        Assert.Null(await direct.GetAsync("a", "p"));
    }

    [EmulatorFact]
    public async Task ALostResponse_LeavesTheItemInTheRealStore_AndAReplayOfTheCreateFindsItThere()
    {
        var (chaos, direct, runtime) = Build(("lostResponseRate", 1));

        var lost = await Assert.ThrowsAsync<StoreUnavailableException>(() => chaos.SaveIfUnchangedAsync(Entity("a"), "p"));

        Assert.Equal(HttpStatusCode.RequestTimeout, lost.StatusCode);
        Assert.True(runtime.Journal.Count("repository", "lostResponse") >= 1);
        Assert.NotNull(await direct.GetAsync("a", "p")); // the write was made
        Assert.Null(await direct.SaveIfUnchangedAsync(Entity("a"), "p")); // a replay of the create: the real store says it exists
    }

    [EmulatorFact]
    public async Task AReadThroughTheLayer_IsTheRealStoresAnswer_WithNoFault()
    {
        var (chaos, direct, runtime) = Build(("failureRate", 0));
        await direct.SaveIfUnchangedAsync(Entity("a"), "p");

        var read = await chaos.GetAsync("a", "p");

        Assert.Equal("a", read?.Id);
        Assert.Equal(0, runtime.Journal.Count("repository", "failure"));
    }
}

/// <summary>The adapter's own conversion, against the real SDK: a store that cannot be reached is <see cref="StoreUnavailableException"/>, not a SDK exception (register 170).</summary>
public sealed class CosmosUnreachableTests
{
    [Fact]
    public async Task ARealClientThatCannotReachTheStore_ThrowsStoreUnavailable()
    {
        // Nothing listens on this port: a real connection failure. The SDK lets an HttpRequestException through (no CosmosException is made when it cannot even fetch the account), which the first version of the mapping missed. One operation only: the SDK retries for about 20 seconds.
        using var client = new CosmosClient("AccountEndpoint=http://127.0.0.1:1/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==", new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            RequestTimeout = TimeSpan.FromSeconds(2),
            MaxRetryAttemptsOnRateLimitedRequests = 0,
        });
        var repo = new CosmosRepository<VersionedEntity>(client.GetContainer("db", "items"));
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));

        var read = await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.GetAsync("a", "p", cts.Token));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, read.StatusCode);
        Assert.NotNull(read.InnerException); // the SDK's own exception is kept for the log (here the HttpRequestException the SDK lets through when it cannot connect)
    }
}
