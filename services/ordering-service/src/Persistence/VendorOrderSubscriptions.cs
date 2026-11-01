using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>
/// Subscribes the vendor order read model to the order events (<c>N-03</c>). Ordering consumes its own events through the same
/// interface any other service would, as the modular-monolith rule requires (ADR-0009). The consumer group is named for this service, so it
/// is independent of any other subscriber to the same events (register item 29).
/// </summary>
public sealed class VendorOrderSubscriptions(IEventSubscriber subscriber, VendorOrderProjection projection, ILogger<VendorOrderSubscriptions> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        await subscriber.SubscribeAsync<OrderPlacedPayload>(OrderEventTypes.Placed, projection.OnPlacedAsync, ct);
        await subscriber.SubscribeAsync<OrderConfirmedPayload>(OrderEventTypes.Confirmed, projection.OnConfirmedAsync, ct);
        await subscriber.SubscribeAsync<OrderPreparationStartedPayload>(OrderEventTypes.PreparationStarted, projection.OnPreparationStartedAsync, ct);
        await subscriber.SubscribeAsync<OrderReadyForFulfillmentPayload>(OrderEventTypes.ReadyForFulfillment, projection.OnReadyForFulfillmentAsync, ct);
        await subscriber.SubscribeAsync<OrderCompletedPayload>(OrderEventTypes.Completed, projection.OnCompletedAsync, ct);
        await subscriber.SubscribeAsync<OrderCancelledPayload>(OrderEventTypes.Cancelled, projection.OnCancelledAsync, ct);
        logger.LogInformation("The vendor order read model is subscribed to the six order events");
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
