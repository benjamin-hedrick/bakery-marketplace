using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using OrderingService.Outbox;
using OrderingService.Persistence;

namespace OrderingService.Orders;

/// <summary>
/// The Ordering side of the fulfillment seam (WI-ORD-003, ADR-0001): when a strategy reports <c>OrderFulfillmentCompleted</c>, the order is
/// completed, stored with its <c>OrderCompleted</c> event in one write and published through the outbox as for any other transition. Ordering
/// knows nothing of which strategy answered. The handler is idempotent: an order already completed is left alone, an order that is no longer
/// <c>ReadyForFulfillment</c> (cancelled in the meantime) or unknown is logged and ignored, and a lost write race is read again.
/// </summary>
public sealed partial class FulfillmentCompletionHandler(OrderStore orders, OrderEventPublisher eventPublisher, ILogger<FulfillmentCompletionHandler> logger)
{
    private const int MaxAttempts = 3;

    public async Task OnCompletedAsync(DomainEventEnvelope<OrderFulfillmentCompletedPayload> envelope, CancellationToken ct)
    {
        var p = envelope.Payload;
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var stored = await orders.GetForVendorAsync(p.OrderId, p.VendorId, ct);
            if (stored is null)
            {
                LogUnknownOrder(logger, p.OrderId);
                return;
            }

            var order = stored.Order;
            if (order.Status == OrderStatus.Completed) return; // a duplicate delivery or a second press: nothing to do
            if (order.Status != OrderStatus.ReadyForFulfillment)
            {
                LogNotReady(logger, p.OrderId, order.Status);
                return;
            }

            order.Complete(p.CompletedAt);
            var saved = await orders.TryUpdateAsync(stored, order, ct);
            if (saved is null) continue; // changed between our read and write: read it again and decide again

            await eventPublisher.PublishInlineAsync(saved);
            return;
        }

        // Still racing after the attempts: fail so the transport redelivers the event.
        throw new InvalidOperationException($"Order {p.OrderId} kept changing while it was being completed.");
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Fulfillment completed for unknown order {OrderId}; ignored")]
    private static partial void LogUnknownOrder(ILogger logger, string orderId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Fulfillment completed for order {OrderId}, which is {Status} and not ReadyForFulfillment; ignored")]
    private static partial void LogNotReady(ILogger logger, string orderId, OrderStatus status);
}

/// <summary>Subscribes the Ordering side to the strategies' answer.</summary>
public sealed class FulfillmentCompletionSubscription(IEventSubscriber subscriber, FulfillmentCompletionHandler handler) : IHostedService
{
    public Task StartAsync(CancellationToken ct) =>
        subscriber.SubscribeAsync<OrderFulfillmentCompletedPayload>(FulfillmentEventTypes.Completed, handler.OnCompletedAsync, ct);

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
