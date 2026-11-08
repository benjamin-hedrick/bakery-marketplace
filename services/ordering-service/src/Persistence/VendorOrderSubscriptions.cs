using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>
/// Subscribes the vendor order read model to the order events (<c>N-03</c>). Ordering consumes its own events through the same
/// interface any other service would, as the modular-monolith rule requires (ADR-0009). The consumer group is named for this service, so it
/// is independent of any other subscriber to the same events (register item 29).
/// </summary>
public sealed partial class VendorOrderSubscriptions(IEventSubscriber subscriber, VendorOrderProjection projection, ILogger<VendorOrderSubscriptions> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await subscriber.SubscribeAsync<OrderPlacedPayload>(OrderEventTypes.Placed, projection.OnPlacedAsync, ct: cancellationToken);
        await subscriber.SubscribeAsync<OrderConfirmedPayload>(OrderEventTypes.Confirmed, projection.OnConfirmedAsync, ct: cancellationToken);
        await subscriber.SubscribeAsync<OrderPreparationStartedPayload>(OrderEventTypes.PreparationStarted, projection.OnPreparationStartedAsync, ct: cancellationToken);
        await subscriber.SubscribeAsync<OrderReadyForFulfillmentPayload>(OrderEventTypes.ReadyForFulfillment, projection.OnReadyForFulfillmentAsync, ct: cancellationToken);
        await subscriber.SubscribeAsync<OrderCompletedPayload>(OrderEventTypes.Completed, projection.OnCompletedAsync, ct: cancellationToken);
        await subscriber.SubscribeAsync<OrderCancelledPayload>(OrderEventTypes.Cancelled, projection.OnCancelledAsync, ct: cancellationToken);
        LogReadModelSubscribed(logger);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "The vendor order read model is subscribed to the six order events")]
    private static partial void LogReadModelSubscribed(ILogger logger);
}
