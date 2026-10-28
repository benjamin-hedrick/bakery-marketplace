using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace BakeryMarketplace.Data.Tests;

/// <summary>A second entity type, so batches are tested across types in one container.</summary>
public sealed class OtherEntity : IETagged
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    public string PartitionKey { get; set; } = "";
    public string Label { get; set; } = "";

    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)]
    public string? ETag { get; set; }
}

/// <summary>
/// Contract for <see cref="IPartitionBatch"/> (WI-CAT-006): all operations apply or none do, across entity types in one partition.
/// The scenarios are plain methods; the fake and Cosmos classes below each declare them as tests.
/// </summary>
public abstract class BatchContractTests
{
    protected abstract IRepository<VersionedEntity> Versioned { get; }
    protected abstract IRepository<OtherEntity> Others { get; }
    protected abstract IBatchFactory Batches { get; }

    private static VersionedEntity Counter(string id, string partition = "bp") => new() { Id = id, PartitionKey = partition, Name = "counter" };
    private static OtherEntity Other(string id, string partition = "bp") => new() { Id = id, PartitionKey = partition, Label = "record" };

    protected async Task Run_CreatesItemsOfDifferentTypesTogether()
    {
        var ok = await Batches.CreateBatch("bp").Create(Counter("b1")).Create(Other("b2")).ExecuteAsync();

        Assert.True(ok);
        Assert.NotNull(await Versioned.GetAsync("b1", "bp"));
        Assert.NotNull(await Others.GetAsync("b2", "bp"));
    }

    protected async Task Run_ReplacesWithTheETagAndGivesTheItemANewOne()
    {
        var created = await Versioned.SaveIfUnchangedAsync(Counter("b3"), "bp");
        var read = await Versioned.GetAsync("b3", "bp");
        read!.Counter = 9;

        var ok = await Batches.CreateBatch("bp").ReplaceIfUnchanged(read).Create(Other("b3-audit")).ExecuteAsync();

        Assert.True(ok);
        var after = await Versioned.GetAsync("b3", "bp");
        Assert.Equal(9, after!.Counter);
        Assert.NotEqual(created!.ETag, after.ETag);
    }

    protected async Task Run_AStaleReplaceAppliesNothing_NotEvenTheOtherOperations()
    {
        await Versioned.SaveIfUnchangedAsync(Counter("b4"), "bp");
        var stale = await Versioned.GetAsync("b4", "bp");
        var fresh = await Versioned.GetAsync("b4", "bp");
        fresh!.Counter = 1;
        await Versioned.SaveIfUnchangedAsync(fresh, "bp");

        stale!.Counter = 99;
        var ok = await Batches.CreateBatch("bp").Create(Other("b4-audit")).ReplaceIfUnchanged(stale).ExecuteAsync();

        Assert.False(ok);
        Assert.Null(await Others.GetAsync("b4-audit", "bp")); // the create was rolled back
        Assert.Equal(1, (await Versioned.GetAsync("b4", "bp"))!.Counter);
    }

    protected async Task Run_ACreateOfAnExistingIdAppliesNothing()
    {
        await Others.SaveIfUnchangedAsync(Other("b5-exists"), "bp");
        await Versioned.SaveIfUnchangedAsync(Counter("b5"), "bp");
        var read = await Versioned.GetAsync("b5", "bp");
        read!.Counter = 5;

        var ok = await Batches.CreateBatch("bp").ReplaceIfUnchanged(read).Create(Other("b5-exists")).ExecuteAsync();

        Assert.False(ok);
        Assert.Equal(0, (await Versioned.GetAsync("b5", "bp"))!.Counter); // the replace was rolled back
    }

    protected async Task Run_AReplaceOfADeletedItemFailsTheBatch()
    {
        await Versioned.SaveIfUnchangedAsync(Counter("b6"), "bp");
        var read = await Versioned.GetAsync("b6", "bp");
        await Versioned.DeleteAsync("b6", "bp");

        var ok = await Batches.CreateBatch("bp").ReplaceIfUnchanged(read!).Create(Other("b6-audit")).ExecuteAsync();

        Assert.False(ok);
        Assert.Null(await Others.GetAsync("b6-audit", "bp"));
    }

    protected async Task Run_AnEmptyBatchOrAnOversizedOneIsRejected()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => Batches.CreateBatch("bp").ExecuteAsync());

        var batch = Batches.CreateBatch("bp");
        for (var i = 0; i < IPartitionBatch.MaxOperations; i++) batch.Create(Other($"b7-{i}"));
        Assert.Throws<InvalidOperationException>(() => batch.Create(Other("b7-one-too-many")));
    }

    protected async Task Run_ContendingBatchesNeverLoseAnUpdateOrDoubleApply()
    {
        await Versioned.SaveIfUnchangedAsync(Counter("b8"), "bp");

        async Task TakeOne(int n)
        {
            for (var attempt = 0; attempt < 200; attempt++)
            {
                var current = await Versioned.GetAsync("b8", "bp");
                current!.Counter++;
                var ok = await Batches.CreateBatch("bp").ReplaceIfUnchanged(current).Create(Other($"b8-claim-{n}")).ExecuteAsync();
                if (ok) return;
            }
            throw new InvalidOperationException("Too many conflicts.");
        }

        await Task.WhenAll(Enumerable.Range(0, 20).Select(TakeOne));

        Assert.Equal(20, (await Versioned.GetAsync("b8", "bp"))!.Counter);
        for (var n = 0; n < 20; n++) Assert.NotNull(await Others.GetAsync($"b8-claim-{n}", "bp"));
    }
}

public sealed class FakeBatchTests : BatchContractTests
{
    private readonly FakeDatabase _database = new();
    private readonly IRepository<VersionedEntity> _versioned;
    private readonly IRepository<OtherEntity> _others;
    private readonly IBatchFactory _batches;

    public FakeBatchTests()
    {
        _versioned = new FakeRepository<VersionedEntity>(e => e.Id, _database);
        _others = new FakeRepository<OtherEntity>(e => e.Id, _database);
        _batches = new FakeBatchFactory(_database);
    }

    protected override IRepository<VersionedEntity> Versioned => _versioned;
    protected override IRepository<OtherEntity> Others => _others;
    protected override IBatchFactory Batches => _batches;

    [Fact] public Task CreatesItemsOfDifferentTypesTogether() => Run_CreatesItemsOfDifferentTypesTogether();
    [Fact] public Task ReplacesWithTheETagAndGivesTheItemANewOne() => Run_ReplacesWithTheETagAndGivesTheItemANewOne();
    [Fact] public Task AStaleReplaceAppliesNothing_NotEvenTheOtherOperations() => Run_AStaleReplaceAppliesNothing_NotEvenTheOtherOperations();
    [Fact] public Task ACreateOfAnExistingIdAppliesNothing() => Run_ACreateOfAnExistingIdAppliesNothing();
    [Fact] public Task AReplaceOfADeletedItemFailsTheBatch() => Run_AReplaceOfADeletedItemFailsTheBatch();
    [Fact] public Task AnEmptyBatchOrAnOversizedOneIsRejected() => Run_AnEmptyBatchOrAnOversizedOneIsRejected();
    [Fact] public Task ContendingBatchesNeverLoseAnUpdateOrDoubleApply() => Run_ContendingBatchesNeverLoseAnUpdateOrDoubleApply();

    [Fact]
    public void AnEntityTypeThatIsNotInTheFakeDatabaseCannotJoinABatch()
    {
        var database = new FakeDatabase();
        _ = new FakeRepository<VersionedEntity>(e => e.Id, database);
        var batch = new FakeBatchFactory(database).CreateBatch("bp");

        Assert.Throws<InvalidOperationException>(() => batch.Create(new OtherEntity { Id = "x", PartitionKey = "bp" }));
    }
}

/// <summary>The same contract on the real Cosmos SDK (transactional batch). Needs COSMOS_CONNECTION_STRING; skipped, never faked, without it.</summary>
public sealed class CosmosBatchTests : BatchContractTests, IAsyncLifetime
{
    private Microsoft.Azure.Cosmos.CosmosClient? _client;
    private Microsoft.Azure.Cosmos.Container? _container;
    private readonly string _database = "batch-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new Microsoft.Azure.Cosmos.CosmosClient(EmulatorFactAttribute.ConnectionString, new Microsoft.Azure.Cosmos.CosmosClientOptions
        {
            ConnectionMode = Microsoft.Azure.Cosmos.ConnectionMode.Gateway,
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

    private Microsoft.Azure.Cosmos.Container Container => _container ?? throw new InvalidOperationException("Cosmos emulator not configured.");

    protected override IRepository<VersionedEntity> Versioned => new CosmosRepository<VersionedEntity>(Container);
    protected override IRepository<OtherEntity> Others => new CosmosRepository<OtherEntity>(Container);
    protected override IBatchFactory Batches => new CosmosBatchFactory(Container);

    [EmulatorFact] public Task CreatesItemsOfDifferentTypesTogether() => Run_CreatesItemsOfDifferentTypesTogether();
    [EmulatorFact] public Task ReplacesWithTheETagAndGivesTheItemANewOne() => Run_ReplacesWithTheETagAndGivesTheItemANewOne();
    [EmulatorFact] public Task AStaleReplaceAppliesNothing_NotEvenTheOtherOperations() => Run_AStaleReplaceAppliesNothing_NotEvenTheOtherOperations();
    [EmulatorFact] public Task ACreateOfAnExistingIdAppliesNothing() => Run_ACreateOfAnExistingIdAppliesNothing();
    [EmulatorFact] public Task AReplaceOfADeletedItemFailsTheBatch() => Run_AReplaceOfADeletedItemFailsTheBatch();
    [EmulatorFact] public Task AnEmptyBatchOrAnOversizedOneIsRejected() => Run_AnEmptyBatchOrAnOversizedOneIsRejected();
    [EmulatorFact] public Task ContendingBatchesNeverLoseAnUpdateOrDoubleApply() => Run_ContendingBatchesNeverLoseAnUpdateOrDoubleApply();
}
