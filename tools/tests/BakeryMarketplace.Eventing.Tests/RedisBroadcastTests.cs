using BakeryMarketplace.Eventing;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Runs the broadcast contract against Redis Pub/Sub. With <c>REDIS_CONNECTION_STRING</c> unreachable it falls back to the in-memory
/// backend, so a green run without Docker does not prove the Redis adapter (the same caveat as the other Redis adapter tests).
/// Two separate connections stand for two service instances.
/// </summary>
public sealed class RedisBroadcastTests : BroadcastContractTests
{
    private static readonly Lazy<(IConnectionMultiplexer? First, IConnectionMultiplexer? Second)> Connections = new(() =>
    {
        var connectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? "localhost:6379";
        try
        {
            var options = ConfigurationOptions.Parse(connectionString);
            options.ConnectTimeout = 1000;
            options.SyncTimeout = 1000;
            options.AbortOnConnectFail = true;
            return (ConnectionMultiplexer.Connect(options), ConnectionMultiplexer.Connect(options));
        }
        catch
        {
            return (null, null);
        }
    });

    private static readonly InMemoryBroadcast Fallback = new();

    protected override (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateInstance() =>
        Connections.Value.First is { } c ? Pair(new RedisBroadcast(c)) : (Fallback, Fallback);

    protected override (IBroadcastPublisher Publisher, IBroadcastSubscriber Subscriber) CreateOtherInstance() =>
        Connections.Value.Second is { } c ? Pair(new RedisBroadcast(c)) : (Fallback, Fallback);

    private static (IBroadcastPublisher, IBroadcastSubscriber) Pair(RedisBroadcast b) => (b, b);

    [Fact]
    public void Reports_which_backend_was_used()
    {
        // Not an assertion about Redis: it makes the fallback visible in the test output.
        Console.WriteLine(Connections.Value.First is null
            ? "RedisBroadcastTests ran against the in-memory fallback"
            : "RedisBroadcastTests ran against Redis");
    }
}
