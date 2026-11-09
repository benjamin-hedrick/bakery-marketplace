using System.Security.Cryptography;
using System.Text;
using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The <c>broadcast</c> layer (ADR-0024, ADR-0021): the Pub/Sub nudge that tells the live vendor screens something changed. Publisher side:
/// a failed publish (<c>failureRate</c>), a lost one that reports success (<c>dropRate</c>), slowness and an outage window. Subscriber side:
/// a delivery that never reaches the handler (<c>deliveryDropRate</c>). The vendor queue's polling fallback is what these exercise: a lost nudge must
/// cost only a delay. Decisions are keyed by the channel and a hash of the message (the message text is never journaled).
/// </summary>
public sealed class ChaosBroadcastPublisher : IBroadcastPublisher
{
    public const string LayerName = "broadcast";

    private readonly IBroadcastPublisher _inner;
    private readonly ChaosLayer _layer;

    public ChaosBroadcastPublisher(IBroadcastPublisher inner, ChaosRuntime runtime)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(LayerName);
    }

    internal static string MessageKey(string channel, string message) =>
        $"{channel}:{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(message)), 0, 4)}";

    public async Task PublishAsync(string channel, string message, CancellationToken ct = default)
    {
        var key = MessageKey(channel, message);
        await _layer.BeforeAsync("publish", key, "failure", "failureRate", () => new InvalidOperationException("ChaosBroadcast: simulated publish failure."), ct);
        if (_layer.Inject("drop", "dropRate", key))
            return;
        await _inner.PublishAsync(channel, message, ct);
    }
}

public sealed class ChaosBroadcastSubscriber : IBroadcastSubscriber
{
    private readonly IBroadcastSubscriber _inner;
    private readonly ChaosLayer _layer;

    public ChaosBroadcastSubscriber(IBroadcastSubscriber inner, ChaosRuntime runtime)
    {
        _inner = inner ?? throw new ArgumentNullException(nameof(inner));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(ChaosBroadcastPublisher.LayerName);
    }

    public Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default) =>
        _inner.SubscribeAsync(channel, async (message, token) =>
        {
            var key = ChaosBroadcastPublisher.MessageKey(channel, message);
            if (_layer.Inject("deliveryDrop", "deliveryDropRate", key))
                return;
            if (_layer.Latency is { } delay)
            {
                _layer.Record("latency", $"deliver:{key}");
                await Task.Delay(delay, token);
            }

            await handler(message, token);
        }, ct);
}
