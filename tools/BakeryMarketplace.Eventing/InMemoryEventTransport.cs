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
