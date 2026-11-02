using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// A <see cref="FactAttribute"/> that is reported as skipped, not passed, when Redis is not reachable at <c>REDIS_CONNECTION_STRING</c>
/// (default <c>localhost:6379</c>), so a run without Docker does not look like proof of the Redis path.
/// </summary>
internal sealed class RedisFactAttribute : FactAttribute
{
    public static readonly string ConnectionString = Environment.GetEnvironmentVariable("REDIS_CONNECTION_STRING") ?? "localhost:6379";

    private static readonly Lazy<bool> Reachable = new(() =>
    {
        try
        {
            var options = ConfigurationOptions.Parse(ConnectionString);
            options.ConnectTimeout = 1000;
            options.SyncTimeout = 1000;
            options.AbortOnConnectFail = true;
            using var connection = ConnectionMultiplexer.Connect(options);
            return connection.IsConnected;
        }
        catch
        {
            return false;
        }
    });

    public RedisFactAttribute()
    {
        if (!Reachable.Value) Skip = $"Redis is not reachable at {ConnectionString}";
    }
}

/// <summary>
/// WI-QUE-003 step 3 (ADR-0021 decision 4): two hosts of the ordering service on one Redis. A change applied through one is received by streams
/// open on the other, because the instance that projects an event is not necessarily the one a vendor's screen is connected to (Redis Streams
/// deliver each event to one instance of the service; Pub/Sub then reaches every instance).
/// </summary>
public sealed partial class VendorOrderStreamTests
{
    private static (string, string)[] RedisSettings => [("Events:Backend", "redis"), ("Redis:ConnectionString", RedisFactAttribute.ConnectionString)];

    private static async Task<Frame> NextOrderAsync(Sse stream, string orderId, Func<JsonElement, bool>? where = null, TimeSpan? within = null)
    {
        var until = DateTime.UtcNow + (within ?? Wait);
        while (DateTime.UtcNow < until)
        {
            var frame = await stream.NextEventAsync("order", until - DateTime.UtcNow);
            // The shared Redis may still hold events of earlier runs, which these hosts also project: look for this order.
            var order = Json(frame);
            if (order.GetProperty("id").GetString() == orderId && (where?.Invoke(order) ?? true)) return frame;
        }
        throw new TimeoutException($"No matching change of order {orderId} arrived.");
    }

    [RedisFact]
    public async Task AChangeAppliedOnOneHostReachesAStreamOnTheOtherThroughRedis()
    {
        await using var rig = new Rig(RedisSettings);
        var hostA = rig.Factory;
        var hostB = rig.StartOtherHost();
        using var vendorOnA = hostA.ClientWithRole(Seed.Vendor, "Vendor");
        using var vendorOnB = hostB.ClientWithRole(Seed.Vendor, "Vendor");
        using var streamA = await Sse.OpenAsync(vendorOnA);
        using var streamB = await Sse.OpenAsync(vendorOnB);
        Assert.Equal(HttpStatusCode.OK, streamB.Status);

        var id = await rig.PlaceOrderAsync(); // through host A

        var onA = Json(await NextOrderAsync(streamA, id));
        var onB = Json(await NextOrderAsync(streamB, id));
        Assert.Equal("Placed", onA.GetProperty("status").GetString());
        Assert.Equal(onA.GetProperty("lastSequence").GetInt64(), onB.GetProperty("lastSequence").GetInt64());
    }

    [RedisFact]
    public async Task AVendorsActionOnOneHostIsPushedToAStreamOnTheOtherWithAHigherSequence()
    {
        await using var rig = new Rig(RedisSettings);
        var hostB = rig.StartOtherHost();
        using var vendorOnA = rig.Vendor();
        using var vendorOnB = hostB.ClientWithRole(Seed.Vendor, "Vendor");
        using var streamB = await Sse.OpenAsync(vendorOnB);
        var id = await rig.PlaceOrderAsync();
        var placed = Json(await NextOrderAsync(streamB, id));

        Assert.Equal(HttpStatusCode.OK, (await vendorOnA.PostAsync($"/ordering/orders/{id}/confirm", null)).StatusCode);

        var confirmed = Json(await NextOrderAsync(streamB, id, o => o.GetProperty("status").GetString() == "Confirmed"));
        Assert.True(confirmed.GetProperty("lastSequence").GetInt64() > placed.GetProperty("lastSequence").GetInt64());
    }

    [RedisFact]
    public async Task AnotherVendorsStreamOnTheOtherHostDoesNotReceiveTheChange()
    {
        await using var rig = new Rig(RedisSettings);
        var hostB = rig.StartOtherHost();
        using var otherVendorOnB = hostB.ClientWithRole("vendor-other-002", "Vendor");
        using var streamB = await Sse.OpenAsync(otherVendorOnB);
        using var mine = await Sse.OpenAsync(rig.Vendor());

        var id = await rig.PlaceOrderAsync();
        await NextOrderAsync(mine, id);

        await Assert.ThrowsAsync<TimeoutException>(() => NextOrderAsync(streamB, id, within: TimeSpan.FromSeconds(1)));
    }

    [RedisFact]
    public async Task TheRedisSubscriptionExistsWhileAStreamIsOpenAndEndsWithTheLast()
    {
        await using var rig = new Rig(RedisSettings);
        using var connection = await ConnectionMultiplexer.ConnectAsync(RedisFactAttribute.ConnectionString);
        var server = connection.GetServers()[0];
        var channel = RedisChannel.Literal(Streaming.VendorOrderChannels.For(Seed.Vendor));
        var hub = rig.Factory.Services.GetRequiredService<Streaming.VendorOrderStreamHub>();
        Assert.Equal(0, await server.SubscriptionSubscriberCountAsync(channel));

        using var a = await Sse.OpenAsync(rig.Vendor());
        using var b = await Sse.OpenAsync(rig.Vendor());
        Assert.Equal(1, await server.SubscriptionSubscriberCountAsync(channel)); // one subscription for the vendor on this instance, not one per stream

        a.Dispose();
        await WaitUntilAsync(() => hub.OpenCount == 1);
        Assert.Equal(1, await server.SubscriptionSubscriberCountAsync(channel));

        b.Dispose();
        await WaitUntilAsync(() => hub.OpenCount == 0);
        await WaitUntilAsync(() => server.SubscriptionSubscriberCount(channel) == 0);
    }

    [RedisFact]
    public async Task TwoHostsWithAStreamEachDoNotShareASubscriptionAndBothAreFreedOnClose()
    {
        await using var rig = new Rig(RedisSettings);
        var hostB = rig.StartOtherHost();
        using var connection = await ConnectionMultiplexer.ConnectAsync(RedisFactAttribute.ConnectionString);
        var server = connection.GetServers()[0];
        var channel = RedisChannel.Literal(Streaming.VendorOrderChannels.For(Seed.Vendor));

        var a = await Sse.OpenAsync(rig.Vendor());
        var b = await Sse.OpenAsync(hostB.ClientWithRole(Seed.Vendor, "Vendor"));

        Assert.Equal(2, await server.SubscriptionSubscriberCountAsync(channel)); // one per instance

        a.Dispose();
        b.Dispose();
        await WaitUntilAsync(() => server.SubscriptionSubscriberCount(channel) == 0);
    }
}
