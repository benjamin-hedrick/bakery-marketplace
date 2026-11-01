using Microsoft.Extensions.Options;
using OrderingService.Persistence;

namespace OrderingService.Outbox;

/// <summary>Bound from the <c>Outbox</c> configuration section.</summary>
public sealed class OutboxOptions
{
    /// <summary>The usual gap between sweeps when events have been turning up.</summary>
    public int SweepSeconds { get; set; } = 5;

    /// <summary>When sweeps keep finding nothing the gap grows, up to this many seconds. A crashed instance's events wait at most this long.</summary>
    public int MaxIdleSeconds { get; set; } = 60;

    /// <summary>Events newer than this are left to the inline publish that is probably still running.</summary>
    public int GraceSeconds { get; set; } = 3;

    public int BatchSize { get; set; } = 50;

    /// <summary>How long checkout waits for its own inline publish before leaving the events to the relay. The order is already stored.</summary>
    public int InlinePublishTimeoutSeconds { get; set; } = 2;

    /// <summary>
    /// After this many failed attempts at one event, the order's outbox is parked: no more retries until an operator fixes the cause and
    /// unparks it. Later events of the order wait, so nothing overtakes the failed one (register item 74).
    /// </summary>
    public int MaxPublishAttempts { get; set; } = 5;

    public bool RelayEnabled { get; set; } = true;
}

/// <summary>
/// Lets the code that just failed to publish wake the relay now instead of waiting out its (possibly long, idle) delay. In memory and
/// per instance by design: it is an accelerator for a miss this instance knows about, never a gate, because a crashed instance cannot signal.
/// </summary>
public sealed class OutboxSignal
{
    private readonly SemaphoreSlim _signal = new(0, 1);

    public void Wake()
    {
        try
        {
            _signal.Release();
        }
        catch (SemaphoreFullException)
        {
            // already signalled; one wake-up is enough
        }
    }

    /// <summary>Waits up to <paramref name="delay"/> or until woken. Returns true when woken.</summary>
    public Task<bool> WaitAsync(TimeSpan delay, CancellationToken ct) => _signal.WaitAsync(delay, ct);
}

/// <summary>The relay's timing, as pure functions so they are easy to test.</summary>
public static class OutboxTiming
{
    /// <param name="consecutiveEmptySweeps">How many sweeps in a row found nothing.</param>
    /// <param name="jitter">A number from 0 to 1; the delay is varied by about plus or minus 20% so instances do not poll in step.</param>
    public static TimeSpan NextDelay(OutboxOptions options, int consecutiveEmptySweeps, double jitter)
    {
        var baseSeconds = Math.Max(0.01, options.SweepSeconds);
        var maxSeconds = Math.Max(baseSeconds, options.MaxIdleSeconds);

        // Stay at the base rate for the first few quiet sweeps, then double each time, up to the idle maximum.
        var seconds = consecutiveEmptySweeps <= 2
            ? baseSeconds
            : Math.Min(maxSeconds, baseSeconds * Math.Pow(2, consecutiveEmptySweeps - 2));
        return TimeSpan.FromSeconds(seconds * (0.8 + 0.4 * Math.Clamp(jitter, 0, 1)));
    }
}

/// <summary>
/// The safety net behind the inline publish (WI-ORD-005): periodically finds orders that still have events pending (a crash between saving
/// and publishing, a broker outage, a lost cleanup race) and publishes them. It looks at one sparse property, so an idle sweep is cheap, and it
/// slows down while idle. Several instances may sweep at once: they can send the same event twice, which is harmless because the event id is
/// the same, and one of them loses the cleanup race and moves on.
/// </summary>
public sealed class OutboxRelay(
    OrderStore orders,
    OrderEventPublisher publisher,
    OutboxSignal signal,
    IOptions<OutboxOptions> options,
    TimeProvider time,
    ILogger<OutboxRelay> logger) : BackgroundService
{
    private readonly OutboxOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.RelayEnabled) return;

        var empty = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (found, published) = await SweepOnceAsync(stoppingToken);
                empty = found == 0 ? empty + 1 : 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                logger.LogError(e, "Outbox sweep failed; it will be retried");
                empty = 0; // something is wrong: keep the normal pace rather than backing off
            }

            try
            {
                var woken = await signal.WaitAsync(OutboxTiming.NextDelay(_options, empty, Random.Shared.NextDouble()), stoppingToken);
                if (woken) empty = 0; // someone just missed a publish: be attentive
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>One pass: publish every order that has had events pending longer than the grace period. Returns what it found and sent.</summary>
    public async Task<(int Found, int Published)> SweepOnceAsync(CancellationToken ct)
    {
        var cutoff = time.GetUtcNow().AddSeconds(-_options.GraceSeconds);
        var pending = await orders.FindPendingAsync(cutoff, _options.BatchSize, ct);
        var published = 0;
        foreach (var stored in pending) published += (await publisher.PublishPendingAsync(stored, ct)).Published;

        if (pending.Count > 0)
        {
            // These are events the inline path did not deliver, so this line is the signal that a miss happened.
            logger.LogWarning("Outbox relay: {Orders} order(s) had unpublished events; {Published} event(s) published", pending.Count, published);
        }
        return (pending.Count, published);
    }
}
