using BakeryMarketplace.Chaos;
using NotificationService.Sending;

namespace NotificationService.Chaos;

/// <summary>
/// The <c>notification</c> layer (ADR-0024): a decorator around the sender that injects a delivery failure (<c>failureRate</c>: the sender throws, which
/// the contract defines as "not delivered, try again later"), slowness (<c>latencyMs</c>) and an outage window. Keyed by the event id and the
/// attempt number, never by the recipient's address or name. The wrapped sender is untouched.
/// </summary>
public sealed class ChaosNotificationSender(INotificationSender inner, ChaosLayer layer) : INotificationSender
{
    public async Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        await layer.BeforeAsync("send", notification.EventId.ToString(), "failure", "failureRate",
            () => new InvalidOperationException("ChaosNotificationSender: simulated delivery failure."), ct);
        await inner.SendAsync(notification, ct);

        // The message was sent, the provider's answer never arrived: "try again later" will send it a second time.
        if (layer.LostResponse("send", notification.EventId.ToString()))
            throw new TimeoutException("ChaosNotificationSender: the message was sent but the response was lost.");
    }
}
