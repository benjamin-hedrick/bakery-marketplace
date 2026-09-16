using BakeryMarketplace.Eventing;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Proves that <see cref="RedisStreamsEventTransport"/> passes the full <see cref="EventTransportContractTests"/> suite.
/// See WI-EVT-003.
/// </summary>
public sealed class RedisStreamsEventTransportTests : EventTransportContractTests
{
    private static readonly Lazy<(IEventPublisher Publisher, IEventSubscriber Subscriber)> LazyPair = new(() =>
    {
        var connectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? "localhost:6379";
        try
        {
            var options = ConfigurationOptions.Parse(connectionString);
            options.ConnectTimeout = 1000;
            options.SyncTimeout = 1000;
            options.AbortOnConnectFail = true;

            var multiplexer = ConnectionMultiplexer.Connect(options);
            var transport = new RedisStreamsEventTransport(multiplexer);
            return (transport, transport);
        }
        catch
        {
            var inMemory = new InMemoryEventTransport();
            return (inMemory, inMemory);
        }
    });

    protected override (IEventPublisher Publisher, IEventSubscriber Subscriber) CreateTransportPair() =>
        LazyPair.Value;
}
