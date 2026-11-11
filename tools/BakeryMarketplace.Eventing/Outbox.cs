using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Eventing;

// The parts of the outbox (ADR-0003, register item 30) that are the same in every service: the settings, the relay's timing and loop, the wake-up
// signal and the rule for publishing in order. What differs stays in each service, because it depends on the store: how a document keeps its
// outbox entries, how published entries are removed, and how a failed attempt is counted (ordering uses a per-order document write; the catalog
// edits the listing document it already holds). The services' own publishers and relays are small adapters over these.

/// <summary>Bound from the <c>Outbox</c> configuration section, the same in every service.</summary>
public sealed class OutboxOptions
{
    /// <summary>The usual gap between sweeps when events have been turning up.</summary>
    public int SweepSeconds { get; set; } = 5;

    /// <summary>When sweeps keep finding nothing the gap grows, up to this many seconds. A crashed instance's events wait at most this long.</summary>
    public int MaxIdleSeconds { get; set; } = 60;

    /// <summary>Events newer than this are left to the inline publish that is probably still running.</summary>
    public int GraceSeconds { get; set; } = 3;

    public int BatchSize { get; set; } = 50;

    /// <summary>How long a request waits for its own inline publish before leaving the events to the relay. The change is already stored.</summary>
    public int InlinePublishTimeoutSeconds { get; set; } = 2;

    /// <summary>
    /// After this many failed attempts at one event, the document's outbox is parked: no more retries until an operator fixes the cause and
    /// unparks it. Later events of the document wait, so nothing overtakes the failed one (ordering's register item 74).
    /// </summary>
    public int MaxPublishAttempts { get; set; } = 5;

    public bool RelayEnabled { get; set; } = true;
}

/// <summary>How many of a document's pending events were published, whether publishing stopped early, and whether its outbox is now parked.</summary>
public sealed record OutboxPublishResult(int Published, bool Failed, bool Parked = false)
{
    public static readonly OutboxPublishResult Nothing = new(0, false);
}

/// <summary>
/// Lets the code that just failed to publish wake the relay now instead of waiting out its (possibly long, idle) delay. In memory and
/// per instance by design: it is an accelerator for a miss this instance knows about, never a gate, because a crashed instance cannot signal.
/// </summary>
public sealed class OutboxSignal : IDisposable
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

    public void Dispose() => _signal.Dispose();
}

/// <summary>The relay's timing, as pure functions so they are easy to test.</summary>
public static class OutboxTiming
{
    /// <param name="options">The sweep and idle settings.</param>
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

/// <summary>What <see cref="OutboxPublishing.PublishInOrderAsync{TEntry}"/> did: the ids it sent, and the entry it stopped at, if any.</summary>
public sealed record OrderedPublishOutcome<TEntry>(IReadOnlyList<string> PublishedIds, TEntry? Failed, Exception? Error = null)
    where TEntry : class
{
    /// <summary>
    /// Whether the failed attempt counts toward parking. A transport failure (broker unreachable, timeout) does not: it may pass, so the relay
    /// keeps retrying it with a back-off. Any other failure is one retrying may never fix.
    /// </summary>
    public bool CountsTowardParking => Failed is not null && Error is not EventTransportException;
}

public static class OutboxPublishing
{
    /// <summary>
    /// Sends the entries one by one in the order given and stops at the first failure, so a consumer never sees a later event of a document
    /// without the earlier ones having been sent first. Cancellation is not a failure and is thrown to the caller.
    /// </summary>
    public static async Task<OrderedPublishOutcome<TEntry>> PublishInOrderAsync<TEntry>(
        IEnumerable<TEntry> entriesInOrder,
        Func<TEntry, string> eventIdOf,
        Func<TEntry, CancellationToken, Task> send,
        Action<TEntry, Exception> onFailure,
        CancellationToken ct)
        where TEntry : class
    {
        var published = new List<string>();
        foreach (var entry in entriesInOrder)
        {
            try
            {
                await send(entry, ct);
                published.Add(eventIdOf(entry));
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                onFailure(entry, e);
                return new OrderedPublishOutcome<TEntry>(published, entry, e); // later events wait: they must not overtake this one
            }
        }
        return new OrderedPublishOutcome<TEntry>(published, null);
    }
}

/// <summary>
/// The loop of an outbox relay: sweep, then wait (the delay grows while sweeps find nothing, and a wake-up signal cuts it short). A subclass says what
/// one sweep does. Several instances may sweep at once; they can send the same event twice, which is harmless because the event id is the same.
/// </summary>
public abstract partial class OutboxRelayBase(OutboxOptions options, OutboxSignal? signal, ILogger logger, string name) : BackgroundService
{
    protected OutboxOptions Options { get; } = options;

    protected ILogger Logger { get; } = logger;

    /// <summary>One pass: publish what has been pending longer than the grace period. Returns what it found and how many events it sent.</summary>
    public abstract Task<(int Found, int Published)> SweepOnceAsync(CancellationToken ct);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!Options.RelayEnabled) return;

        var empty = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var (found, sent) = await SweepOnceAsync(stoppingToken);
                // Events found but none sent means the broker is failing: back off like an idle relay instead of hammering it.
                empty = found == 0 || sent == 0 ? empty + 1 : 0;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                LogSweepFailed(Logger, e, name);
                empty = 0; // something is wrong: keep the normal pace rather than backing off
            }

            try
            {
                var delay = OutboxTiming.NextDelay(Options, empty, Random.Shared.NextDouble());
                if (signal is null)
                {
                    await Task.Delay(delay, stoppingToken);
                }
                else if (await signal.WaitAsync(delay, stoppingToken))
                {
                    empty = 0; // someone just missed a publish: be attentive
                }
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "{Relay} outbox sweep failed; it will be retried")]
    private static partial void LogSweepFailed(ILogger logger, Exception exception, string relay);
}
