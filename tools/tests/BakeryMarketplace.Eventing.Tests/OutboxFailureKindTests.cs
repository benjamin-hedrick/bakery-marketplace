using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Eventing.Tests;

public class OutboxFailureKindTests
{
    private static Task<OrderedPublishOutcome<string>> PublishAsync(Exception failure) =>
        OutboxPublishing.PublishInOrderAsync(["a", "b"], e => e, (e, _) => e == "b" ? throw failure : Task.CompletedTask, (_, _) => { }, default);

    [Fact]
    public async Task ATransportFailureDoesNotCountTowardParking()
    {
        var outcome = await PublishAsync(new EventTransportException("broker down"));

        Assert.Equal(["a"], outcome.PublishedIds);
        Assert.Equal("b", outcome.Failed);
        Assert.False(outcome.CountsTowardParking);
    }

    [Fact]
    public async Task AnyOtherFailureCountsTowardParking()
    {
        var outcome = await PublishAsync(new InvalidOperationException("no payload type"));

        Assert.True(outcome.CountsTowardParking);
    }

    [Fact]
    public async Task NothingFailedMeansNothingCounts()
    {
        var outcome = await OutboxPublishing.PublishInOrderAsync(["a"], e => e, (_, _) => Task.CompletedTask, (_, _) => { }, default);

        Assert.False(outcome.CountsTowardParking);
    }
}
