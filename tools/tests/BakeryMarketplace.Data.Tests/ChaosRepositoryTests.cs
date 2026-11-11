using System.Net;
using BakeryMarketplace.Chaos;
using BakeryMarketplace.Data;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data.Tests;

// ADR-0024 / WI-CHAOS-002: the repository layer. With every setting off the decorators must be invisible: the three shared contract suites pass
// through them. Each injected fault is shown to happen, and every test asserts the journal before it asserts the effect.

internal static class RepositoryChaos
{
    public static ChaosRuntime Runtime(long seed = 1, params (string Setting, double Value)[] settings) =>
        ChaosRuntime.ForTests(ChaosScenario.Of("repository-test", seed, "repository", settings));
}

public sealed class ChaosRepositoryContractTests : RepositoryContractTests<TestEntity>
{
    protected override IRepository<TestEntity> CreateRepository() =>
        new ChaosRepository<TestEntity>(new FakeRepository<TestEntity>(e => e.Id), RepositoryChaos.Runtime());

    protected override TestEntity CreateEntity(string id, string partitionKey) => new(id, partitionKey, $"Entity-{id}");

    protected override string GetId(TestEntity entity) => entity.Id;

    [Fact] public Task SaveThenGet_ReturnsEntity() => Run_SaveThenGet_ReturnsEntity();
    [Fact] public Task GetMissingId_ReturnsNull_NotException() => Run_GetMissingId_ReturnsNull_NotException();
    [Fact] public Task DeleteThenGet_ReturnsNull() => Run_DeleteThenGet_ReturnsNull();
    [Fact] public Task Query_ReturnsOnlyMatchingEntitiesInPartition() => Run_Query_ReturnsOnlyMatchingEntitiesInPartition();

    protected override System.Linq.Expressions.Expression<Func<TestEntity, bool>> IdStartsWith(string prefix) => e => e.Id.StartsWith(prefix);
}

public sealed class ChaosConcurrencyContractTests : ConcurrencyContractTests
{
    protected override IRepository<VersionedEntity> CreateRepository() =>
        new ChaosRepository<VersionedEntity>(new FakeRepository<VersionedEntity>(e => e.Id), RepositoryChaos.Runtime());

    [Fact] public Task ANewEntityIsCreatedOnceAndAnotherCreateFails() => Run_ANewEntityIsCreatedOnceAndAnotherCreateFails();
    [Fact] public Task AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag() => Run_AReadEntityCanBeSavedWhileNobodyElseHasChangedIt_AndGetsANewETag();
    [Fact] public Task AStaleEntityIsNotSaved_AndTheStoredValueSurvives() => Run_AStaleEntityIsNotSaved_AndTheStoredValueSurvives();
    [Fact] public Task APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails() => Run_APlainSaveChangesTheETag_SoALaterConditionalSaveOfAnOlderReadFails();
    [Fact] public Task ADeletedEntityCannotBeSavedConditionally() => Run_ADeletedEntityCannotBeSavedConditionally();
    [Fact] public Task ReadersGetIndependentCopies() => Run_ReadersGetIndependentCopies();
    [Fact] public Task ConcurrentReadModifyWriteLoopsLoseNoUpdate() => Run_ConcurrentReadModifyWriteLoopsLoseNoUpdate();
    [Fact] public Task AQueryWithNoPartitionKeySpansAllPartitions() => Run_AQueryWithNoPartitionKeySpansAllPartitions();
}

public sealed class ChaosBatchContractTests : BatchContractTests
{
    private readonly IRepository<VersionedEntity> _versioned;
    private readonly IRepository<OtherEntity> _others;
    private readonly IBatchFactory _batches;

    public ChaosBatchContractTests()
    {
        var database = new FakeDatabase();
        var runtime = RepositoryChaos.Runtime();
        _versioned = new ChaosRepository<VersionedEntity>(new FakeRepository<VersionedEntity>(e => e.Id, database), runtime);
        _others = new ChaosRepository<OtherEntity>(new FakeRepository<OtherEntity>(e => e.Id, database), runtime);
        _batches = new ChaosBatchFactory(new FakeBatchFactory(database), runtime);
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
}

public sealed class ChaosRepositoryBehaviourTests
{
    private static (ChaosRepository<VersionedEntity> Repo, ChaosRuntime Runtime) Build(long seed, params (string Setting, double Value)[] settings)
    {
        var runtime = RepositoryChaos.Runtime(seed, settings);
        return (new ChaosRepository<VersionedEntity>(new FakeRepository<VersionedEntity>(e => e.Id), runtime), runtime);
    }

    private static VersionedEntity Entity(string id) => new() { Id = id, PartitionKey = "p", Name = "n" };

    [Fact]
    public async Task FailureRateOfOne_ThrowsTheCosmos503_ForEveryOperation_AndStoresNothing()
    {
        var (repo, runtime) = Build(1, ("failureRate", 1));

        var save = await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.SaveAsync(Entity("a"), "p"));
        await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.GetAsync("a", "p"));
        await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.DeleteAsync("a", "p"));
        await Assert.ThrowsAsync<StoreUnavailableException>(async () =>
        {
            await foreach (var _ in repo.QueryAsync("p", q => q)) { }
        });

        Assert.Equal(4, runtime.Journal.Count("repository", "failure"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, save.StatusCode);
    }

    [Fact]
    public async Task ConflictRateOfOne_MakesAConditionalSaveReturnNull_AndSavesNothing()
    {
        var (repo, runtime) = Build(1, ("conflictRate", 1));
        var plain = await repo.SaveAsync(Entity("a"), "p"); // plain saves are not conditional: untouched

        var conflicted = await repo.SaveIfUnchangedAsync(plain, "p");

        Assert.Equal(1, runtime.Journal.Count("repository", "conflict"));
        Assert.Null(conflicted);
        Assert.Equal("n", (await repo.GetAsync("a", "p"))!.Name);
    }

    [Fact]
    public async Task ABatchCanLoseItsConcurrencyCheck_AndWritesNothing()
    {
        var database = new FakeDatabase();
        var runtime = RepositoryChaos.Runtime(1, ("conflictRate", 1));
        var repo = new FakeRepository<VersionedEntity>(e => e.Id, database);
        var batch = new ChaosBatchFactory(new FakeBatchFactory(database), runtime).CreateBatch("p");

        var applied = await batch.Create(Entity("b")).ExecuteAsync();

        Assert.Equal(1, runtime.Journal.Count("repository", "conflict"));
        Assert.False(applied);
        Assert.Null(await repo.GetAsync("b", "p"));
    }

    [Fact]
    public async Task ALostResponse_MeansTheWriteWasMade_ButTheCallerIsToldItTimedOut()
    {
        var database = new FakeDatabase();
        var runtime = RepositoryChaos.Runtime(1, ("lostResponseRate", 1));
        var inner = new FakeRepository<VersionedEntity>(e => e.Id, database);
        var repo = new ChaosRepository<VersionedEntity>(inner, runtime);

        var save = await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.SaveAsync(Entity("a"), "p"));

        Assert.Equal(1, runtime.Journal.Count("repository", "lostResponse"));
        Assert.Equal(HttpStatusCode.RequestTimeout, save.StatusCode);
        Assert.NotNull(await inner.GetAsync("a", "p")); // the data is there although the caller was told it failed

        await Assert.ThrowsAsync<StoreUnavailableException>(() => repo.DeleteAsync("a", "p"));
        Assert.Null(await inner.GetAsync("a", "p")); // and a lost delete really deleted

        var batch = new ChaosBatchFactory(new FakeBatchFactory(database), runtime).CreateBatch("p");
        await Assert.ThrowsAsync<StoreUnavailableException>(() => batch.Create(Entity("b")).ExecuteAsync());
        Assert.NotNull(await inner.GetAsync("b", "p")); // a lost batch was applied
    }

    [Fact]
    public async Task LatencyAndAnOutageWindowAreInjected_AndTheOutageEnds()
    {
        var (slow, slowRuntime) = Build(1, ("latencyMs", 150));
        var started = DateTime.UtcNow;
        await slow.GetAsync("a", "p");
        Assert.Equal(1, slowRuntime.Journal.Count("repository", "latency"));
        Assert.True(DateTime.UtcNow - started >= TimeSpan.FromMilliseconds(120));

        var (down, downRuntime) = Build(1, ("outageWindowSeconds", 0.2));
        await Assert.ThrowsAsync<StoreUnavailableException>(() => down.GetAsync("a", "p"));
        Assert.Equal(1, downRuntime.Journal.Count("repository", "outage"));
        await Task.Delay(300);
        Assert.Null(await down.GetAsync("a", "p")); // recovered
    }

    [Fact]
    public async Task TheSameSeedFailsTheSameOperations_AnotherSeedOthers_AndARetryIsJudgedAfresh()
    {
        async Task<string> Run(long seed)
        {
            var (repo, _) = Build(seed, ("failureRate", 0.5));
            var outcome = "";
            for (var i = 0; i < 40; i++)
            {
                try { await repo.GetAsync($"id-{i}", $"partition-{i}"); outcome += "o"; }
                catch (StoreUnavailableException) { outcome += "x"; }
            }

            return outcome;
        }

        var first = await Run(11);
        Assert.Equal(first, await Run(11));
        Assert.NotEqual(first, await Run(12));
        Assert.Contains('o', first);
        Assert.Contains('x', first);

        var (retrying, runtime) = Build(3, ("failureRate", 0.5));
        var attempts = 0;
        while (attempts < 50)
        {
            attempts++;
            try { await retrying.GetAsync("same", "same"); break; }
            catch (StoreUnavailableException) { }
        }

        Assert.True(attempts < 50, "a retried read must eventually get through");
        Assert.Equal(attempts - 1, runtime.Journal.Count("repository", "failure"));
    }
}

public class StoreUnavailableExceptionTests
{
    [Theory]
    [InlineData(HttpStatusCode.ServiceUnavailable, true)]
    [InlineData(HttpStatusCode.RequestTimeout, true)]
    [InlineData(HttpStatusCode.TooManyRequests, true)]
    [InlineData(HttpStatusCode.InternalServerError, false)] // a bug or a bad request is not "try again"
    [InlineData(HttpStatusCode.BadRequest, false)]
    [InlineData(HttpStatusCode.Conflict, false)]
    [InlineData(HttpStatusCode.PreconditionFailed, false)]
    public void OnlyTheTransportClassStatusesAreUnavailable(HttpStatusCode status, bool expected) =>
        Assert.Equal(expected, StoreUnavailableException.IsTransport(status));
}
