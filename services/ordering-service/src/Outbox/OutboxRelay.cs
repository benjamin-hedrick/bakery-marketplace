using BakeryMarketplace.Eventing;
using Microsoft.Extensions.Options;
using OrderingService.Persistence;

namespace OrderingService.Outbox;

/// <summary>
/// The safety net behind the inline publish (WI-ORD-005): periodically finds orders that still have events pending (a crash between saving
/// and publishing, a broker outage, a lost cleanup race) and publishes them. It looks at one sparse property, so an idle sweep is cheap, and it
/// slows down while idle (the loop and timing are shared, <see cref="OutboxRelayBase"/>). Several instances may sweep at once: they can send the
/// same event twice, which is harmless because the event id is the same, and one of them loses the cleanup race and moves on.
/// </summary>
public sealed partial class OutboxRelay(
    OrderStore orders,
    OrderEventPublisher publisher,
    OutboxSignal signal,
    IOptions<OutboxOptions> options,
    TimeProvider time,
    ILogger<OutboxRelay> logger) : OutboxRelayBase(options.Value, signal, logger, "Order")
{
    public override async Task<(int Found, int Published)> SweepOnceAsync(CancellationToken ct)
    {
        var cutoff = time.GetUtcNow().AddSeconds(-Options.GraceSeconds);
        var pending = await orders.FindPendingAsync(cutoff, Options.BatchSize, ct);
        var published = 0;
        foreach (var stored in pending) published += (await publisher.PublishPendingAsync(stored, ct)).Published;

        if (pending.Count > 0)
        {
            // These are events the inline path did not deliver, so this line is the signal that a miss happened.
            LogOutboxRelayPublished(Logger, pending.Count, published);
        }
        return (pending.Count, published);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Outbox relay: {Orders} order(s) had unpublished events; {Published} event(s) published")]
    private static partial void LogOutboxRelayPublished(ILogger logger, int orders, int published);
}
