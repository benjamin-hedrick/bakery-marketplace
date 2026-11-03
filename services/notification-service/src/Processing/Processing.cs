using BakeryMarketplace.Caching;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using NotificationService.Contacts;
using NotificationService.Sending;

namespace NotificationService.Processing;

/// <summary>What the composer is told about an order event. The payload is the typed record, as received.</summary>
public sealed record OrderEventInfo(Guid EventId, string EventType, string OrderId, string CustomerId, object Payload);

/// <summary>Turns an order event and a contact into a subject and body (<c>NOT-002</c>).</summary>
public interface IMessageComposer
{
    (string Subject, string Body) Compose(OrderEventInfo info, Contact contact);
}

/// <summary>
/// Remembers which events already produced a message, so a redelivered event sends nothing twice (ADR-0003). Held in the cache provider:
/// with a distributed cache it holds across instances and restarts; with the in-process fallback it holds for this instance only, and a
/// restart can repeat a message. A crash between the send and the mark can repeat one as well: delivery is at-least-once.
/// </summary>
public sealed class SentLedger(ICacheProvider cache, TimeSpan? retention = null)
{
    private static string Key(Guid eventId) => $"notification:sent:{eventId:N}";

    public Task<bool> WasSentAsync(Guid eventId, CancellationToken ct) => cache.ExistsAsync(Key(eventId), ct);

    public Task MarkSentAsync(Guid eventId, CancellationToken ct) =>
        cache.SetAsync(Key(eventId), true, retention ?? TimeSpan.FromDays(7), ct);
}

/// <summary>
/// Handles one batch of events of one type: skips those already sent, reads the contacts of all the rest in one call, composes and
/// sends each message, and returns the ids of the events that must be tried again (a failed contact read or send). A customer with no
/// contact is skipped and logged, not retried: a retry cannot make an address appear. Logs carry ids and types only.
/// </summary>
public sealed class OrderEventNotifier(
    IContactDirectory contacts, IMessageComposer composer, INotificationSender sender, SentLedger ledger, ILogger<OrderEventNotifier> logger)
{
    public async Task<IReadOnlyCollection<Guid>> HandleBatchAsync<T>(
        IReadOnlyList<DomainEventEnvelope<T>> events, Func<T, string> orderOf, Func<T, string?> customerOf, CancellationToken ct)
    {
        var failed = new List<Guid>();
        var pending = new List<(DomainEventEnvelope<T> Event, string OrderId, string CustomerId)>();
        foreach (var e in events)
        {
            if (await SafeAsync(() => ledger.WasSentAsync(e.EventId, ct), false, "ledger read")) continue; // a ledger failure may repeat a message, never lose one
            var customerId = customerOf(e.Payload);
            if (string.IsNullOrEmpty(customerId))
            {
                logger.LogWarning("Event {EventId} ({EventType}) names no customer; no notification", e.EventId, e.EventType);
                continue;
            }
            pending.Add((e, orderOf(e.Payload), customerId));
        }
        if (pending.Count == 0) return failed;

        IReadOnlyDictionary<string, Contact> found;
        try
        {
            found = await contacts.GetContactsAsync(pending.Select(p => p.CustomerId).Distinct().ToArray(), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Contacts for {Count} events could not be read; they will be tried again", pending.Count);
            return pending.Select(p => p.Event.EventId).ToList();
        }

        foreach (var (e, orderId, customerId) in pending)
        {
            if (!found.TryGetValue(customerId, out var contact))
            {
                logger.LogWarning("Order {OrderId}: no contact for the customer; event {EventId} ({EventType}) skipped", orderId, e.EventId, e.EventType);
                continue;
            }
            try
            {
                var info = new OrderEventInfo(e.EventId, e.EventType, orderId, customerId, e.Payload!);
                var (subject, body) = composer.Compose(info, contact);
                await sender.SendAsync(new Notification(e.EventId, orderId, e.EventType, contact.Email, contact.DisplayName, subject, body), ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "Order {OrderId}: event {EventId} ({EventType}) could not be sent; it will be tried again", orderId, e.EventId, e.EventType);
                failed.Add(e.EventId);
                continue;
            }
            await SafeAsync(async () => { await ledger.MarkSentAsync(e.EventId, ct); return true; }, false, "ledger write");
        }
        return failed;
    }

    private async Task<bool> SafeAsync(Func<Task<bool>> action, bool onFailure, string what)
    {
        try { return await action(); }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "The notification ledger failed ({What}); continuing", what);
            return onFailure;
        }
    }
}

/// <summary>Subscribes the notifier to the six order events, in batches (one contact read per poll).</summary>
public sealed class OrderEventSubscriptions(IEventSubscriber subscriber, OrderEventNotifier notifier, ILogger<OrderEventSubscriptions> logger) : IHostedService
{
    /// <summary>The event types subscribed to; each needs a template in <see cref="TemplateMessageComposer"/>.</summary>
    public static readonly string[] EventTypes = ["OrderPlaced", "OrderConfirmed", "OrderPreparationStarted", "OrderReadyForFulfillment", "OrderCompleted", "OrderCancelled"];

    public async Task StartAsync(CancellationToken ct)
    {
        await subscriber.SubscribeBatchAsync<OrderPlacedPayload>("OrderPlaced",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        await subscriber.SubscribeBatchAsync<OrderConfirmedPayload>("OrderConfirmed",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        await subscriber.SubscribeBatchAsync<OrderPreparationStartedPayload>("OrderPreparationStarted",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        await subscriber.SubscribeBatchAsync<OrderReadyForFulfillmentPayload>("OrderReadyForFulfillment",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        await subscriber.SubscribeBatchAsync<OrderCompletedPayload>("OrderCompleted",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        await subscriber.SubscribeBatchAsync<OrderCancelledPayload>("OrderCancelled",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct);
        logger.LogInformation("Notifications are subscribed to the six order events");
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
