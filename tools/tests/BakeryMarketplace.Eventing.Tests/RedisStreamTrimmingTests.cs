using BakeryMarketplace.Eventing;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>Runs only when REDIS_CONNECTION_STRING is set to a running Redis; otherwise it is reported as skipped, not passed.</summary>
public sealed class RedisFactAttribute : FactAttribute
{
    public static readonly string? ConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING");

    public RedisFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString)) Skip = "Set REDIS_CONNECTION_STRING (for example 127.0.0.1:6379) to run against Redis.";
    }
}

/// <summary>Stream trimming (register item 75): off unless a limit is given. Real Redis only; it never falls back to the in-memory transport.</summary>
public sealed class RedisStreamTrimmingTests : IDisposable
{
    private readonly Lazy<ConnectionMultiplexer> _redis = new(() => ConnectionMultiplexer.Connect(RedisFactAttribute.ConnectionString!));

    public void Dispose()
    {
        if (_redis.IsValueCreated) _redis.Value.Dispose();
    }

    private async Task<long> PublishAndMeasureAsync(int? limit, int count)
    {
        var type = $"TrimTest{Guid.NewGuid():N}";
        var transport = new RedisStreamsEventTransport(_redis.Value, maxStreamLength: limit);
        for (var i = 1; i <= count; i++)
        {
            await transport.PublishAsync(new DomainEventEnvelope<string>(Guid.NewGuid(), type, 1, DateTimeOffset.UtcNow, "Test", "agg", i, "payload"));
        }
        var db = _redis.Value.GetDatabase();
        var length = await db.StreamLengthAsync($"events:{type}");
        await db.KeyDeleteAsync($"events:{type}");
        return length;
    }

    [RedisFact]
    public async Task WithoutALimitNothingIsTrimmed()
    {
        Assert.Equal(300, await PublishAndMeasureAsync(null, 300));
    }

    [RedisFact]
    public async Task WithALimitTheStreamStaysNearTheLimit()
    {
        var length = await PublishAndMeasureAsync(100, 1000);

        Assert.InRange(length, 100, 400); // approximate trimming works in blocks: it may keep somewhat more than the limit, never fewer
    }

    [RedisFact]
    public void AZeroOrNegativeLimitIsRefused()
    {
        var db = _redis.Value.GetDatabase();

        Assert.Throws<ArgumentOutOfRangeException>(() => new RedisStreamsEventTransport(db, maxStreamLength: 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new RedisStreamsEventTransport(db, maxStreamLength: -5));
    }
}
