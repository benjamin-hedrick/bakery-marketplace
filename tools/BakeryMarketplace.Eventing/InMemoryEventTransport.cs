using System.Collections.Concurrent;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// Minimal in-memory event transport implementation of <see cref="IEventPublisher"/> and <see cref="IEventSubscriber"/>.
/// Reference transport implementation used for unit testing and local development without external messaging infrastructure.
/// See WI-EVT-001.
/// </summary>
public class InMemoryEventTransport : IEventPublisher, IEventSubscriber
{
    private readonly ConcurrentDictionary<string, List<Delegate>> _subscribers = new();

    public Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        CancellationToken ct = default)
    {
        _subscribers.AddOrUpdate(
            eventType,
            _ => new List<Delegate> { handler },
            (_, list) =>
            {
                lock (list)
                {
                    list.Add(handler);
                }
                return list;
            });

        return Task.CompletedTask;
    }

    /// <summary>
    /// In memory a publish is delivered at once, so a batch is always one event. Failed ids are not retried (this transport has no
    /// redelivery); a failure is thrown to the publisher, as for <see cref="SubscribeAsync{T}"/>.
    /// </summary>
    public Task SubscribeBatchAsync<T>(
        string eventType,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler,
        CancellationToken ct = default) =>
        SubscribeAsync<T>(eventType, async (envelope, token) =>
        {
            var failed = await handler(new[] { envelope }, token);
            if (failed.Count > 0) throw new InvalidOperationException($"Batch handler reported event {envelope.EventId} as failed.");
        }, ct);

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        envelope = EventTracing.StampTraceparent(envelope);
        if (_subscribers.TryGetValue(envelope.EventType, out var handlers))
        {
            List<Delegate> copy;
            lock (handlers)
            {
                copy = handlers.ToList();
            }

            foreach (var delegateHandler in copy)
            {
                if (delegateHandler is Func<DomainEventEnvelope<T>, CancellationToken, Task> handler)
                {
                    using var consumer = EventTracing.StartConsumer(envelope);
                    await handler(envelope, ct);
                }
            }
        }
    }
}
