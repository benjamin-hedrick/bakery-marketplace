using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace BakeryMarketplace.Data.Tests;

/// <summary>Entity with an ETag, used by the optimistic concurrency contract tests. Newtonsoft attributes match what Cosmos stores.</summary>
public sealed class VersionedEntity : IETagged
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    public string PartitionKey { get; set; } = "";
    public int Counter { get; set; }
    public string Name { get; set; } = "";

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)]
    public string? ETag { get; set; }
}

/// <summary>
/// Contract for <see cref="IRepository{T}.SaveIfUnchangedAsync"/> (open item 30, WI-CAT-005). Every implementation that supports it
/// subclasses this and provides a repository for <see cref="VersionedEntity"/>.
/// </summary>
public abstract class ConcurrencyContractTests
{
    protected abstract IRepository<VersionedEntity> CreateRepository();

    private static VersionedEntity New(string id, string partition = "p1") => new() { Id = id, PartitionKey = partition, Name = "first" };

    protected async Task Run_ANewEntityIsCreatedOnceAndAnotherCreateFails()
    {
        var repo = CreateRepository();

        var created = await repo.SaveIfUnchangedAsync(New("a1"), "p1");
        var duplicate = await repo.SaveIfUnchangedAsync(New("a1"), "p1");

        Assert.NotNull(created);
        Assert.False(string.IsNullOrEmpty(created!.ETag));
        Assert.Null(duplicate);
    }

    protected async Task Run_AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag()
    {
        var repo = CreateRepository();
        var created = await repo.SaveIfUnchangedAsync(New("a2"), "p1");
        var read = await repo.GetAsync("a2", "p1");
        Assert.Equal(created!.ETag, read!.ETag);

        read.Counter = 5;
        var saved = await repo.SaveIfUnchangedAsync(read, "p1");

        Assert.NotNull(saved);
        Assert.NotEqual(created.ETag, saved.ETag);
        Assert.Equal(5, (await repo.GetAsync("a2", "p1"))!.Counter);
    }

    protected async Task Run_AStaleEntityIsNotSaved_AndTheStoredValueSurvives()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("a3"), "p1");
        var first = await repo.GetAsync("a3", "p1");
        var second = await repo.GetAsync("a3", "p1");

        first!.Counter = 1;
        Assert.NotNull(await repo.SaveIfUnchangedAsync(first, "p1"));
        second!.Counter = 99;
        var lost = await repo.SaveIfUnchangedAsync(second, "p1");

        Assert.Null(lost);
        Assert.Equal(1, (await repo.GetAsync("a3", "p1"))!.Counter);
    }

    protected async Task Run_APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("a4"), "p1");
        var stale = await repo.GetAsync("a4", "p1");

        var overwrite = await repo.GetAsync("a4", "p1");
        overwrite!.Name = "overwritten";
        await repo.SaveAsync(overwrite, "p1");

        stale!.Name = "stale write";
        Assert.Null(await repo.SaveIfUnchangedAsync(stale, "p1"));
        Assert.Equal("overwritten", (await repo.GetAsync("a4", "p1"))!.Name);
    }

    protected async Task Run_ADeletedEntityCannotBeSavedConditionally()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("a5"), "p1");
        var read = await repo.GetAsync("a5", "p1");
        await repo.DeleteAsync("a5", "p1");

        Assert.Null(await repo.SaveIfUnchangedAsync(read!, "p1"));
        Assert.Null(await repo.GetAsync("a5", "p1"));
    }

    protected async Task Run_ReadersGetIndependentCopies()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("a6"), "p1");
        var one = await repo.GetAsync("a6", "p1");
        one!.Name = "changed locally";

        var two = await repo.GetAsync("a6", "p1");

        Assert.Equal("first", two!.Name);
    }

    protected async Task Run_AQueryWithNoPartitionKeySpansAllPartitions()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("q1", "qp-a"), "qp-a");
        await repo.SaveIfUnchangedAsync(New("q2", "qp-b"), "qp-b");
        await repo.SaveIfUnchangedAsync(New("q3", "qp-b"), "qp-b");

        var one = await Collect(repo.QueryAsync("qp-b", q => q.Where(e => e.Name == "first" && e.Counter == 0 && e.Id != "q1")));
        var all = await Collect(repo.QueryAsync("", q => q.Where(e => e.Id == "q1" || e.Id == "q2" || e.Id == "q3")));

        Assert.Equal(["q2", "q3"], one.Select(e => e.Id).OrderBy(i => i));
        Assert.Equal(["q1", "q2", "q3"], all.Select(e => e.Id).OrderBy(i => i));
    }

    private static async Task<List<VersionedEntity>> Collect(IAsyncEnumerable<VersionedEntity> source)
    {
        var list = new List<VersionedEntity>();
        await foreach (var item in source) list.Add(item);
        return list;
    }

    protected async Task Run_ConcurrentReadModifyWriteLoopsLoseNoUpdate()
    {
        var repo = CreateRepository();
        await repo.SaveIfUnchangedAsync(New("a7"), "p1");

        async Task Increment()
        {
            for (var attempt = 0; attempt < 200; attempt++)
            {
                var current = await repo.GetAsync("a7", "p1");
                current!.Counter++;
                if (await repo.SaveIfUnchangedAsync(current, "p1") is not null) return;
            }
            throw new InvalidOperationException("Too many conflicts.");
        }

        await Task.WhenAll(Enumerable.Range(0, 25).Select(_ => Increment()));

        Assert.Equal(25, (await repo.GetAsync("a7", "p1"))!.Counter);
    }
}

/// <summary>The in-memory fake must satisfy the same contract (it is what the service tests run against).</summary>
public sealed class FakeConcurrencyTests : ConcurrencyContractTests
{
    protected override IRepository<VersionedEntity> CreateRepository() => new FakeRepository<VersionedEntity>(e => e.Id);

    [Fact] public Task ANewEntityIsCreatedOnceAndAnotherCreateFails() => Run_ANewEntityIsCreatedOnceAndAnotherCreateFails();
    [Fact] public Task AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag() => Run_AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag();
    [Fact] public Task AStaleEntityIsNotSaved_AndTheStoredValueSurvives() => Run_AStaleEntityIsNotSaved_AndTheStoredValueSurvives();
    [Fact] public Task APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails() => Run_APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails();
    [Fact] public Task ADeletedEntityCannotBeSavedConditionally() => Run_ADeletedEntityCannotBeSavedConditionally();
    [Fact] public Task ReadersGetIndependentCopies() => Run_ReadersGetIndependentCopies();
    [Fact] public Task ConcurrentReadModifyWriteLoopsLoseNoUpdate() => Run_ConcurrentReadModifyWriteLoopsLoseNoUpdate();
    [Fact] public Task AQueryWithNoPartitionKeySpansAllPartitions() => Run_AQueryWithNoPartitionKeySpansAllPartitions();

    [Fact]
    public async Task AnEntityTypeWithoutETagsCannotBeSavedConditionally()
    {
        var repo = new FakeRepository<TestEntity>(e => e.Id);

        await Assert.ThrowsAsync<NotSupportedException>(() => repo.SaveIfUnchangedAsync(new TestEntity("x", "p", "n"), "p"));
    }
}

/// <summary>Runs only when COSMOS_CONNECTION_STRING points at a running Cosmos emulator; otherwise it is reported as skipped, not passed.</summary>
public sealed class EmulatorFactAttribute : FactAttribute
{
    public static readonly string? ConnectionString = Environment.GetEnvironmentVariable("COSMOS_CONNECTION_STRING");

    public EmulatorFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString)) Skip = "Set COSMOS_CONNECTION_STRING to run against the Cosmos emulator.";
    }
}


/// <summary>
/// The same contract against the real Cosmos SDK (conditional replace with If-Match, create with conflict detection). Needs
/// COSMOS_CONNECTION_STRING (for the local vNext emulator: <c>AccountEndpoint=http://localhost:8081/;AccountKey=...</c>);
/// without it every test is reported as skipped. It never falls back to the fake, so a pass means the real store was used.
/// </summary>
public sealed class CosmosConcurrencyTests : ConcurrencyContractTests, IAsyncLifetime
{
    private Microsoft.Azure.Cosmos.CosmosClient? _client;
    private Microsoft.Azure.Cosmos.Container? _container;
    private readonly string _database = "concurrency-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new Microsoft.Azure.Cosmos.CosmosClient(EmulatorFactAttribute.ConnectionString, new Microsoft.Azure.Cosmos.CosmosClientOptions
        {
            ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway, // the emulator only works over the gateway
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        _container = (await db.CreateContainerIfNotExistsAsync(new Microsoft.Azure.Cosmos.ContainerProperties("items", "/PartitionKey"))).Container;
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    protected override IRepository<VersionedEntity> CreateRepository() =>
        new CosmosRepository<VersionedEntity>(_container ?? throw new InvalidOperationException("Cosmos emulator not configured."));

    [EmulatorFact] public Task ANewEntityIsCreatedOnceAndAnotherCreateFails() => Run_ANewEntityIsCreatedOnceAndAnotherCreateFails();
    [EmulatorFact] public Task AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag() => Run_AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag();
    [EmulatorFact] public Task AStaleEntityIsNotSaved_AndTheStoredValueSurvives() => Run_AStaleEntityIsNotSaved_AndTheStoredValueSurvives();
    [EmulatorFact] public Task APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails() => Run_APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails();
    [EmulatorFact] public Task ADeletedEntityCannotBeSavedConditionally() => Run_ADeletedEntityCannotBeSavedConditionally();
    [EmulatorFact] public Task ReadersGetIndependentCopies() => Run_ReadersGetIndependentCopies();
    [EmulatorFact] public Task ConcurrentReadModifyWriteLoopsLoseNoUpdate() => Run_ConcurrentReadModifyWriteLoopsLoseNoUpdate();
    [EmulatorFact] public Task AQueryWithNoPartitionKeySpansAllPartitions() => Run_AQueryWithNoPartitionKeySpansAllPartitions();
}
