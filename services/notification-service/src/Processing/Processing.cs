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
public sealed partial class OrderEventNotifier(
    IContactDirectory contacts, IMessageComposer composer, INotificationSender sender, SentLedger ledger, ILogger<OrderEventNotifier> logger)
{
    public async Task<IReadOnlyCollection<Guid>> HandleBatchAsync<T>(
        IReadOnlyList<DomainEventEnvelope<T>> events, Func<T, string> orderOf, Func<T, string?> customerOf, CancellationToken ct)
    {
        var failed = new List<Guid>();
        var pending = new List<(DomainEventEnvelope<T> Event, string OrderId, string CustomerId)>();
        var seen = new HashSet<Guid>();
        foreach (var e in events)
        {
            // The same event can arrive twice in one batch (a duplicated publish, a redelivery in the same poll); both copies would pass the ledger
            // check below before either is marked, so the second is dropped here. Its entry is acknowledged with the first (register 171).
            if (!seen.Add(e.EventId)) continue;
            if (await SafeAsync(() => ledger.WasSentAsync(e.EventId, ct), false, "ledger read")) continue; // a ledger failure may repeat a message, never lose one
            var customerId = customerOf(e.Payload);
            if (string.IsNullOrEmpty(customerId))
            {
                LogEventWithoutCustomer(logger, e.EventId, e.EventType);
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
            LogContactsReadFailed(logger, ex, pending.Count);
            return pending.Select(p => p.Event.EventId).ToList();
        }

        foreach (var (e, orderId, customerId) in pending)
        {
            if (!found.TryGetValue(customerId, out var contact))
            {
                LogNoContactForCustomer(logger, orderId, e.EventId, e.EventType);
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
                LogNotificationSendFailed(logger, ex, orderId, e.EventId, e.EventType);
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
            LogNotificationLedgerFailed(logger, ex, what);
            return onFailure;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Event {EventId} ({EventType}) names no customer; no notification")]
    private static partial void LogEventWithoutCustomer(ILogger logger, Guid eventId, string eventType);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Contacts for {Count} events could not be read; they will be tried again")]
    private static partial void LogContactsReadFailed(ILogger logger, Exception exception, int count);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Order {OrderId}: no contact for the customer; event {EventId} ({EventType}) skipped")]
    private static partial void LogNoContactForCustomer(ILogger logger, string orderId, Guid eventId, string eventType);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Order {OrderId}: event {EventId} ({EventType}) could not be sent; it will be tried again")]
    private static partial void LogNotificationSendFailed(ILogger logger, Exception exception, string orderId, Guid eventId, string eventType);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The notification ledger failed ({What}); continuing")]
    private static partial void LogNotificationLedgerFailed(ILogger logger, Exception exception, string what);
}

/// <summary>
/// Subscribes the notifier to the order's own events and the pickup strategy's two, in batches (one contact read per poll). The "ready" message
/// follows <c>OrderReadyForPickup</c>, not <c>OrderReadyForFulfillment</c>: the customer-facing message belongs to the strategy (WI-ORD-003).
/// </summary>
public sealed partial class OrderEventSubscriptions(IEventSubscriber subscriber, OrderEventNotifier notifier, ILogger<OrderEventSubscriptions> logger) : IHostedService
{
    /// <summary>The event types subscribed to; each needs a template in <see cref="TemplateMessageComposer"/>.</summary>
    public static readonly string[] EventTypes = ["OrderPlaced", "OrderConfirmed", "OrderPreparationStarted", FulfillmentEventTypes.ReadyForPickup, FulfillmentEventTypes.PickupWindowScheduled, "OrderCompleted", "OrderCancelled"];

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await subscriber.SubscribeBatchAsync<OrderPlacedPayload>("OrderPlaced",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<OrderConfirmedPayload>("OrderConfirmed",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<OrderPreparationStartedPayload>("OrderPreparationStarted",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<OrderReadyForPickupPayload>(FulfillmentEventTypes.ReadyForPickup,
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<PickupWindowScheduledPayload>(FulfillmentEventTypes.PickupWindowScheduled,
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<OrderCompletedPayload>("OrderCompleted",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        await subscriber.SubscribeBatchAsync<OrderCancelledPayload>("OrderCancelled",
            (events, token) => notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, token), ct: cancellationToken);
        LogNotificationsAreSubscribed(logger);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "Notifications are subscribed to the order events and the pickup strategy's events")]
    private static partial void LogNotificationsAreSubscribed(ILogger logger);
}
