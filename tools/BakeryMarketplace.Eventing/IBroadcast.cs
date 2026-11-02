namespace BakeryMarketplace.Eventing;

/// <summary>
/// Publishes a message to every current subscriber of a channel, on every instance of every service connected to the same backend.
/// Delivery is at most once and nothing is stored: a subscriber that is not connected when a message is published never sees it,
/// and nothing is replayed on subscribe. Use it for a nudge that the next change or a poll repairs (ADR-0021), never for facts that
/// must arrive (that is <see cref="IEventPublisher"/>).
/// </summary>
public interface IBroadcastPublisher
{
    /// <summary>Sends <paramref name="message"/> to the subscribers of <paramref name="channel"/>. Does not wait for them to handle it.</summary>
    Task PublishAsync(string channel, string message, CancellationToken ct = default);
}

/// <summary>Receives the messages published to a channel while the subscription is open.</summary>
public interface IBroadcastSubscriber
{
    /// <summary>
    /// Starts receiving the messages published to <paramref name="channel"/> after this call completes. Messages of one channel reach one
    /// subscription's <paramref name="handler"/> one at a time, in the order they were published by one publisher. An exception thrown by a
    /// handler is swallowed: it never reaches the publisher or another subscription. Disposing the result stops delivery; after the
    /// returned task of <c>DisposeAsync</c> completes the handler is not called again.
    /// </summary>
    Task<IAsyncDisposable> SubscribeAsync(string channel, Func<string, CancellationToken, Task> handler, CancellationToken ct = default);
}
