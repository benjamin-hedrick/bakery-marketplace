namespace BakeryMarketplace.Eventing;

/// <summary>
/// Configuration for <see cref="ChaosEventTransport"/>. Controls which failures are injected; every setting defaults to "off",
/// so a default instance makes the decorator transparent (and the shared contract suite still passes through it).
/// </summary>
public class ChaosEventOptions
{
    /// <summary>Probability (0.0-1.0) that one publish fails with an exception before anything is delivered.</summary>
    public double PublishFailureRate { get; set; }

    /// <summary>When set, every publish waits this long first.</summary>
    public TimeSpan? InjectedLatency { get; set; }

    /// <summary>
    /// When set, every publish fails for this long from the moment the decorator is created, then passes through again (recovery).
    /// </summary>
    public TimeSpan? OutageWindow { get; set; }

    /// <summary>
    /// Probability (0.0-1.0) that a published event is delivered twice with the same <c>EventId</c>. The transports promise
    /// at-least-once delivery (ADR-0003), so every consumer must cope; this makes the duplicate happen on demand.
    /// </summary>
    public double DuplicateRate { get; set; }

    /// <summary>
    /// Probability (0.0-1.0) that a publish reports success but the event is never delivered (a lost message). Nothing in the transport
    /// contract promises this cannot happen; what protects against it is the outbox, which keeps the event until it is confirmed sent.
    /// </summary>
    public double DropRate { get; set; }

    /// <summary>
    /// Probability (0.0-1.0) that a published event is held back and delivered only after the next event is published, so the two
    /// arrive in the wrong order. One event is held at a time. A held event that is never followed by another is delivered by
    /// <see cref="ChaosEventTransport.ReleaseHeldAsync"/>. The transports promise no ordering across publishes (ADR-0003); consumers must not assume it.
    /// </summary>
    public double ReorderRate { get; set; }

    /// <summary>
    /// Probability (0.0-1.0) that a consumer's handler fails on an event: the handler is not run and the failure is reported as the
    /// transport would see a throwing handler (an exception, or the event id in a batch's failed list), so redelivery and dead-lettering are exercised.
    /// </summary>
    public double HandlerFailureRate { get; set; }

    /// <summary>A seed makes the random failures repeatable; unset, each run differs.</summary>
    public int? Seed { get; set; }
}

/// <summary>
/// Chaos decorator that injects failures into any event transport pair, for tests and local experiments (WI-EVT-004). It wraps a publisher and a
/// subscriber (usually the same transport object) and injects publish failures, latency, an outage window, dropped, duplicate and out-of-order delivery and failing handlers.
/// Used to prove the outbox's ordered publishing and the consumers' idempotency hold up, in the same way as <c>ChaosCacheProvider</c>
/// proves the cache fallback.
///
/// Production gating follows ADR-0002: the constructor throws when <c>isProduction</c> is true, and
/// <see cref="EventingServiceCollectionExtensions.AddChaosEventTransport"/> refuses a Production host, so chaos cannot be enabled there.
/// Chaos is simulated in-process; no real broker outage is needed.
/// </summary>
public sealed class ChaosEventTransport : IEventPublisher, IEventSubscriber
{
    private readonly IEventPublisher _publisher;
    private readonly IEventSubscriber _subscriber;
    private readonly ChaosEventOptions _options;
    private readonly Random _random;
    private readonly object _randomLock = new();
    private readonly DateTimeOffset? _outageEnd;
    private readonly object _heldLock = new();
    private Func<CancellationToken, Task>? _held;

    public ChaosEventTransport(IEventPublisher publisher, IEventSubscriber subscriber, ChaosEventOptions options, bool isProduction)
    {
        if (isProduction)
            throw new InvalidOperationException(
                "ChaosEventTransport cannot be used in the Production environment. " +
                "This is a hard safety gate per ADR-0002, not a configuration oversight.");

        _publisher = publisher ?? throw new ArgumentNullException(nameof(publisher));
        _subscriber = subscriber ?? throw new ArgumentNullException(nameof(subscriber));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _random = _options.Seed.HasValue ? new Random(_options.Seed.Value) : new Random();

        if (_options.OutageWindow.HasValue)
            _outageEnd = DateTimeOffset.UtcNow + _options.OutageWindow.Value;
    }

    private int _handlerFailures;

    /// <summary>How many handler failures have been injected so far, so a test or a demo can show that chaos really happened.</summary>
    public int HandlerFailuresInjected => Volatile.Read(ref _handlerFailures);

    private bool Roll(double rate)
    {
        if (rate <= 0) return false;
        lock (_randomLock) return _random.NextDouble() < rate;
    }

    public async Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        if (_options.InjectedLatency.HasValue)
            await Task.Delay(_options.InjectedLatency.Value, ct);

        if (_outageEnd.HasValue && DateTimeOffset.UtcNow < _outageEnd.Value)
            throw new InvalidOperationException("ChaosEventTransport: simulated outage window is active.");

        if (Roll(_options.PublishFailureRate))
            throw new InvalidOperationException("ChaosEventTransport: simulated random publish failure.");

        if (Roll(_options.DropRate))
            return;

        Func<CancellationToken, Task>? release;
        lock (_heldLock)
        {
            release = _held;
            _held = null;
            if (release is null && Roll(_options.ReorderRate))
            {
                _held = token => _publisher.PublishAsync(envelope, token); // delivered after the next publish
                return;
            }
        }

        await _publisher.PublishAsync(envelope, ct);

        if (Roll(_options.DuplicateRate))
            await _publisher.PublishAsync(envelope, ct);

        if (release is not null)
            await release(ct);
    }

    /// <summary>Delivers the event held back by <see cref="ChaosEventOptions.ReorderRate"/>, if there is one (for a last event with nothing after it).</summary>
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
            if (Roll(_options.HandlerFailureRate))
            {
                Interlocked.Increment(ref _handlerFailures);
                throw new InvalidOperationException($"ChaosEventTransport: simulated handler failure for event {envelope.EventId}.");
            }

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
                if (Roll(_options.HandlerFailureRate))
                {
                    Interlocked.Increment(ref _handlerFailures);
                    failed.Add(envelope.EventId);
                }
                else
                {
                    passing.Add(envelope);
                }
            }

            if (passing.Count > 0)
                failed.AddRange(await handler(passing, token));
            return failed;
        }, consumerName, ct);
}
