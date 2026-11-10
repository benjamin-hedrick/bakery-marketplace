using System.Collections.Concurrent;
using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The <c>events</c> layer (ADR-0024, WI-EVT-004, WI-CHAOS-001): a decorator around an event publisher and subscriber (usually one transport object)
/// that injects, as the scenario says: publish failures (<c>publishFailureRate</c>), latency (<c>latencyMs</c>), an outage window
/// (<c>outageFromSeconds</c>, <c>outageWindowSeconds</c>), lost events that report success (<c>dropRate</c>), the same event twice
/// (<c>duplicateRate</c>), an event held back until the next one is published (<c>reorderRate</c>), and consumer handlers that fail
/// (<c>handlerFailureRate</c>, single and batch). Every decision is keyed by the event id (and, for failures, the attempt number of that event), so
/// the same scenario hits the same events on every run and a retried event gets a fresh decision; the attempt counts live in the decorator. Every
/// injected fault is in the runtime's journal.
///
/// It knows no business type and changes no behaviour of the transport it wraps. With the scenario's events settings all off it must pass the
/// shared transport contract suite.
/// </summary>
public sealed class ChaosEventTransport : IEventPublisher, IEventSubscriber
{
    public const string LayerName = "events";

    private readonly IEventPublisher _publisher;
    private readonly IEventSubscriber _subscriber;
    private readonly ChaosLayer _layer;
    private readonly ConcurrentDictionary<string, int> _attempts = new();
    private readonly object _heldLock = new();
    private Func<CancellationToken, Task>? _held;

    public ChaosEventTransport(IEventPublisher publisher, IEventSubscriber subscriber, ChaosRuntime runtime)
    {
        _publisher = publisher ?? throw new ArgumentNullException(nameof(publisher));
        _subscriber = subscriber ?? throw new ArgumentNullException(nameof(subscriber));
        _layer = (runtime ?? throw new ArgumentNullException(nameof(runtime))).Layer(LayerName);
    }

    // The n-th time this decorator sees the same event for the same fault, so a retry is judged afresh but a rerun of the scenario judges the same way.
    private string AttemptKey(string fault, Guid eventId) =>
        $"{eventId}:{_attempts.AddOrUpdate($"{fault}:{eventId}", 1, (_, n) => n + 1)}";

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        var key = envelope.EventId.ToString();

        if (_layer.Latency is { } delay)
        {
            _layer.Record("latency", key);
            await Task.Delay(delay, ct);
        }

        if (_layer.InOutage)
        {
            _layer.Record("outage", key);
            throw new InvalidOperationException("ChaosEventTransport: simulated outage window is active.");
        }

        if (_layer.Setting("publishFailureRate") > 0 && _layer.Inject("publishFailure", "publishFailureRate", AttemptKey("publishFailure", envelope.EventId)))
            throw new InvalidOperationException("ChaosEventTransport: simulated publish failure.");

        if (_layer.Inject("drop", "dropRate", key))
            return;

        Func<CancellationToken, Task>? release;
        lock (_heldLock)
        {
            release = _held;
            _held = null;
            if (release is null && _layer.Inject("reorder", "reorderRate", key))
            {
                _held = token => _publisher.PublishAsync(envelope, token); // delivered after the next publish
                return;
            }
        }

        await _publisher.PublishAsync(envelope, ct);

        if (_layer.Inject("duplicate", "duplicateRate", key))
            await _publisher.PublishAsync(envelope, ct);

        if (release is not null)
            await release(ct);

        // The event was delivered but the publisher is told it failed: the outbox will publish it again, so consumers see it twice.
        if (_layer.Setting("publishLostResponseRate") > 0 && _layer.Inject("lostResponse", "publishLostResponseRate", AttemptKey("lostResponse", envelope.EventId)))
            throw new TimeoutException("ChaosEventTransport: the event was published but the response was lost.");
    }

    /// <summary>Delivers the event held back by <c>reorderRate</c>, if there is one (for a last event with nothing after it).</summary>
    public async Task ReleaseHeldAsync(CancellationToken ct = default)
    {
        Func<CancellationToken, Task>? release;
        lock (_heldLock)
        {
            release = _held;
            _held = null;
        }

        if (release is not null)
            await release(ct);
    }

    public Task SubscribeAsync<T>(
        string eventType,
        Func<DomainEventEnvelope<T>, CancellationToken, Task> handler,
        string? consumerName = null,
        CancellationToken ct = default) =>
        _subscriber.SubscribeAsync<T>(eventType, (envelope, token) =>
        {
            if (_layer.Setting("handlerFailureRate") > 0 && _layer.Inject("handlerFailure", "handlerFailureRate", AttemptKey("handlerFailure", envelope.EventId)))
                throw new InvalidOperationException($"ChaosEventTransport: simulated handler failure for event {envelope.EventId}.");
            return handler(envelope, token);
        }, consumerName, ct);

    public Task SubscribeBatchAsync<T>(
        string eventType,
        Func<IReadOnlyList<DomainEventEnvelope<T>>, CancellationToken, Task<IReadOnlyCollection<Guid>>> handler,
        string? consumerName = null,
        CancellationToken ct = default) =>
        _subscriber.SubscribeBatchAsync<T>(eventType, async (batch, token) =>
        {
            // Events picked to fail are reported as failed without reaching the handler; the rest go through, as in a real partial failure.
            var failed = new List<Guid>();
            var passing = new List<DomainEventEnvelope<T>>();
            foreach (var envelope in batch)
            {
                if (_layer.Setting("handlerFailureRate") > 0 && _layer.Inject("handlerFailure", "handlerFailureRate", AttemptKey("handlerFailure", envelope.EventId)))
                    failed.Add(envelope.EventId);
                else
                    passing.Add(envelope);
            }

            if (passing.Count > 0)
                failed.AddRange(await handler(passing, token));
            return failed;
        }, consumerName, ct);
}
