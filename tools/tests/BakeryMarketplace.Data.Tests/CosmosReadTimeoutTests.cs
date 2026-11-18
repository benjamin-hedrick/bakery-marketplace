using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Time.Testing;

namespace BakeryMarketplace.Data.Tests;

/// <summary>
/// Register 206 (the lead chose reads only, 2026-11-18): with the store unreachable the SDK retried a refused connection for 13 to 38 s, once over
/// 5 minutes, and no client option shortened it. A read that has not answered within the repository's limit is now reported as the store being
/// unavailable; a write has no limit. The real SDK talks to a handler that never answers, and the limit runs on a manual clock, so nothing here
/// waits on the wall clock (the guard on each await only stops a broken run from hanging).
/// </summary>
public sealed class CosmosReadTimeoutTests : IDisposable
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan Guard = TimeSpan.FromSeconds(60);

    private sealed class NeverAnswers : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
            throw new InvalidOperationException("unreachable");
        }
    }

    private readonly FakeTimeProvider _time = new();
    private readonly CosmosClient _client = new(
        "AccountEndpoint=http://cosmos.invalid:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
        new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            LimitToEndpoint = true,
            HttpClientFactory = () => new HttpClient(new NeverAnswers()),
        });

    public void Dispose() => _client.Dispose();

    private CosmosRepository<TestEntity> Repository(TimeSpan? limit) => new(_client, "db", "items", limit, _time);

    [Fact]
    public async Task APointReadThatNeverAnswers_IsReportedUnavailableWhenTheLimitPasses()
    {
        var read = Repository(Limit).GetAsync("a", "p");

        _time.Advance(Limit);
        var e = await Assert.ThrowsAsync<StoreUnavailableException>(() => read.WaitAsync(Guard));

        Assert.Equal(HttpStatusCode.RequestTimeout, e.StatusCode);
        Assert.IsType<TimeoutException>(e.InnerException);
    }

    [Fact]
    public async Task AQueryPageThatNeverAnswers_IsReportedUnavailableWhenTheLimitPasses()
    {
        var query = Repository(Limit).QueryAsync("p", q => q.Where(x => x.Name == "n")).ToListAsync().AsTask();

        _time.Advance(Limit);
        var e = await Assert.ThrowsAsync<StoreUnavailableException>(() => query.WaitAsync(Guard));

        Assert.Equal(HttpStatusCode.RequestTimeout, e.StatusCode);
    }

    [Fact]
    public async Task TheCallersOwnCancellation_StaysACancellation()
    {
        using var caller = new CancellationTokenSource();
        var read = Repository(Limit).GetAsync("a", "p", caller.Token);

        await caller.CancelAsync();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => read.WaitAsync(Guard));
    }

    [Fact]
    public async Task AWriteHasNoLimit_ItIsStillWaitingLongAfterTheReadLimit()
    {
        var write = Repository(Limit).SaveAsync(new TestEntity("a", "p", "n"), "p");

        _time.Advance(Limit * 10);
        await Task.Yield();

        // A write cancelled on our side may still be applied, so the read limit never ends it. (It ends when the SDK gives up, after this test;
        // the client is disposed with the class.)
        Assert.False(write.IsCompleted);
    }

    [Theory]
    [InlineData(null, 3.0)]
    [InlineData(1.5, 1.5)]
    [InlineData(0.0, null)]
    [InlineData(-1.0, null)]
    public void TheSettingGivesTheLimit(double? configured, double? expectedSeconds)
    {
        Assert.Equal(expectedSeconds is { } s ? TimeSpan.FromSeconds(s) : null, CosmosClientFactory.ReadTimeout(configured));
    }
}
