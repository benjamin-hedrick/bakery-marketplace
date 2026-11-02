using StackExchange.Redis;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// Redis Pub/Sub implementation of <see cref="IBroadcastPublisher"/> and <see cref="IBroadcastSubscriber"/> (ADR-0021).
/// Pub/Sub is fire-and-forget: a message published while a subscriber is disconnected is lost, which is the contract.
/// Channel names are literal (no pattern matching). Each subscription reads its own ordered queue.
/// </summary>
public sealed class RedisBroadcast(IConnectionMultiplexer multiplexer) : IBroadcastPublisher, IBroadcastSubscriber
{
    public async Task PublishAsync(string channel, string message, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(channel);
        ArgumentNullException.ThrowIfNull(message);
        ct.ThrowIfCancellationRequested();
        await multiplexer.GetSubscriber().PublishAsync(RedisChannel.Literal(channel), message);
    }

    public async Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(channel);
        ArgumentNullException.ThrowIfNull(handler);
        ct.ThrowIfCancellationRequested();
        var stop = new CancellationTokenSource();
        // Subscribe completes once Redis has confirmed the subscription, so a publish after this call is delivered.
        var queue = await multiplexer.GetSubscriber().SubscribeAsync(RedisChannel.Literal(channel));
        queue.OnMessage(async m =>
        {
            if (stop.IsCancellationRequested) return;
            try { await handler(m.Message.ToString(), stop.Token); }
            catch { /* a handler's failure belongs to the handler */ }
        });
        return new Handle(queue, stop);
    }

    private sealed class Handle(ChannelMessageQueue queue, CancellationTokenSource stop) : IAsyncDisposable
    {
        private int _disposed;

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
            await stop.CancelAsync();
            await queue.UnsubscribeAsync();
            await queue.Completion;
        }
    }
}
