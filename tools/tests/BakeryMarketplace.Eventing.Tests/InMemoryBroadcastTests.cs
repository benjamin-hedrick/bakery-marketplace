using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>Proves that <see cref="InMemoryBroadcast"/> passes the <see cref="BroadcastContractTests"/> suite (WI-QUE-003).</summary>
public sealed class InMemoryBroadcastTests : BroadcastContractTests
{
    private readonly InMemoryBroadcast _backend = new();

    protected override (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateInstance() => (_backend, _backend);

    [Fact]
    public async Task Disposing_the_last_subscription_forgets_the_channel()
    {
        var channel = "test:forget";
        var s = await _backend.SubscribeAsync(channel, (_, _) => Task.CompletedTask);
        Assert.Equal(1, _backend.SubscriberCount(channel));

        await s.DisposeAsync();

        Assert.Equal(0, _backend.SubscriberCount(channel));
    }
}
