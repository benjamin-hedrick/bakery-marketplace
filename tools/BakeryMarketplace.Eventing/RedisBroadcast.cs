using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// Redis Pub/Sub implementation of <see cref="IBroadcastPublisher"/> and <see cref="IBroadcastSubscriber"/> (ADR-0021).
/// Pub/Sub is fire-and-forget: a message published while a subscriber is disconnected is lost, which is the contract.
/// Channel names are literal (no pattern matching). Each subscription reads its own ordered queue. A handler's exception never reaches the publisher
/// (the contract), but it is reported at Warning level, so a failing handler is not invisible.
/// </summary>
public sealed partial class RedisBroadcast(IConnectionMultiplexer multiplexer, ILogger<RedisBroadcast>? logger = null) : IBroadcastPublisher, IBroadcastSubscriber
{
    private readonly ILogger _logger = logger ?? NullLogger<RedisBroadcast>.Instance;

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
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogHandlerFailed(_logger, e, channel);
            }
        });
        return new Handle(queue, stop);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "A broadcast handler for channel {Channel} threw; the message was dropped for that subscription")]
    private static partial void LogHandlerFailed(ILogger logger, Exception exception, string channel);

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
