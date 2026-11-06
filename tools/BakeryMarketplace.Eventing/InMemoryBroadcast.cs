using System.Threading.Channels;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// In-process implementation of <see cref="IBroadcastPublisher"/> and <see cref="IBroadcastSubscriber"/>, for tests and single-instance runs.
/// Each subscription has its own unbounded queue and one reader, so a slow handler delays only itself.
/// </summary>
public sealed class InMemoryBroadcast : IBroadcastPublisher, IBroadcastSubscriber
{
    private readonly object _gate = new();
    private readonly Dictionary<string, List<Subscription>> _byChannel = new(StringComparer.Ordinal);

    public Task PublishAsync(string channel, string message, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(channel);
        ArgumentNullException.ThrowIfNull(message);
        ct.ThrowIfCancellationRequested();
        Subscription[] targets;
        lock (_gate)
        {
            targets = _byChannel.TryGetValue(channel, out var list) ? list.ToArray() : [];
        }
        foreach (var s in targets) s.Queue.Writer.TryWrite(message);
        return Task.CompletedTask;
    }

    public Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrEmpty(channel);
        ArgumentNullException.ThrowIfNull(handler);
        ct.ThrowIfCancellationRequested();
        var sub = new Subscription(this, channel, handler);
        lock (_gate)
        {
            if (!_byChannel.TryGetValue(channel, out var list)) _byChannel[channel] = list = [];
            list.Add(sub);
        }
        sub.Start();
        return Task.FromResult<IAsyncDisposable>(sub);
    }

    /// <summary>The number of open subscriptions to a channel (for tests and metrics).</summary>
    public int SubscriberCount(string channel)
    {
        lock (_gate) return _byChannel.TryGetValue(channel, out var list) ? list.Count : 0;
    }

    private void Remove(Subscription sub)
    {
        lock (_gate)
        {
            if (!_byChannel.TryGetValue(sub.ChannelName, out var list)) return;
            list.Remove(sub);
            if (list.Count == 0) _byChannel.Remove(sub.ChannelName);
        }
    }

    private sealed class Subscription(InMemoryBroadcast owner, string channel, Func<string, CancellationToken, Task> handler) : IAsyncDisposable
    {
        private readonly CancellationTokenSource _stop = new();
        private Task _reader = Task.CompletedTask;

        public string ChannelName { get; } = channel;
        public Channel<string> Queue { get; } = Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });

        // The token is deliberately not passed to Task.Run: the loop watches _stop itself, and DisposeAsync awaits _reader. A token that is
        // cancelled before the task starts would leave _reader cancelled and make that await throw.
        public void Start() => _reader = Task.Run(async () =>
        {
            try
            {
                await foreach (var message in Queue.Reader.ReadAllAsync(_stop.Token))
                {
                    try { await handler(message, _stop.Token); }
                    catch (OperationCanceledException) when (_stop.IsCancellationRequested) { return; }
                    catch { /* a handler's failure belongs to the handler */ }
                }
            }
            catch (OperationCanceledException) { }
        });

        private int _disposed;

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
            owner.Remove(this);
            Queue.Writer.TryComplete();
            await _stop.CancelAsync();
            await _reader;
            _stop.Dispose();
        }
    }
}
