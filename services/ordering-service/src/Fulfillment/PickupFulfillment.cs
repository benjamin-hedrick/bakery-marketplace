using System.Security.Cryptography;
using System.Text;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;

namespace OrderingService.Fulfillment;

/// <summary>
/// The pickup fulfillment strategy (WI-ORD-003, ADR-0001). It lives in ordering-service but is its own consumer: it learns about orders only
/// from events and answers only with events, so the Ordering core (<c>Orders</c>, <c>Checkout</c>, <c>Domain</c>) holds no reference to it and a
/// delivery strategy could stand beside it. It listens to three events:
/// <list type="bullet">
/// <item><c>OrderConfirmed</c> of a pickup order with a window: publishes <c>PickupWindowScheduled</c>.</item>
/// <item><c>OrderReadyForFulfillment</c> of a pickup order: publishes <c>OrderReadyForPickup</c>.</item>
/// <item><c>OrderFulfillmentConfirmationRequested</c> of a pickup order: accepts the vendor's confirmation and publishes
/// <c>OrderFulfillmentCompleted</c> (a delivery strategy would want a courier's proof here).</item>
/// </list>
/// What it publishes carries an event id derived from the triggering event and the type, so a redelivery publishes the same id again and
/// consumers dedupe on it. It keeps no state, so every handler is idempotent. A handler that throws is redelivered by the transport and then
/// dead-lettered under this consumer's name.
/// </summary>
public sealed class PickupFulfillment(IEventPublisher publisher)
{
    /// <summary>The consumer name of the strategy: its own consumer group, so it receives every message beside the other consumers of ordering-service.</summary>
    public const string ConsumerName = "pickup-fulfillment";

    public async Task OnConfirmedAsync(DomainEventEnvelope<OrderConfirmedPayload> envelope, CancellationToken ct)
    {
        var p = envelope.Payload;
        if (p.FulfillmentType != FulfillmentType.Pickup || p.Details?.Pickup is not { } window) return;

        await PublishAsync(envelope, FulfillmentEventTypes.PickupWindowScheduled, envelope.OccurredAt,
            new PickupWindowScheduledPayload(p.OrderId, window.WindowStart, window.WindowEnd, p.VendorId, p.CustomerId), ct);
    }

    public async Task OnReadyForFulfillmentAsync(DomainEventEnvelope<OrderReadyForFulfillmentPayload> envelope, CancellationToken ct)
    {
        var p = envelope.Payload;
        if (p.FulfillmentType != FulfillmentType.Pickup) return;

        var window = p.Details?.Pickup;
        await PublishAsync(envelope, FulfillmentEventTypes.ReadyForPickup, envelope.OccurredAt,
            new OrderReadyForPickupPayload(p.OrderId, p.VendorId, p.CustomerId, window?.WindowStart, window?.WindowEnd, window?.Instructions), ct);
    }

    public async Task OnConfirmationRequestedAsync(DomainEventEnvelope<OrderFulfillmentConfirmationRequestedPayload> envelope, CancellationToken ct)
    {
        var p = envelope.Payload;
        if (p.FulfillmentType != FulfillmentType.Pickup) return;

        // For pickup the vendor's word is enough. The time is the request's, not "now", so a redelivery says the same thing.
        await PublishAsync(envelope, FulfillmentEventTypes.Completed, p.RequestedAt,
            new OrderFulfillmentCompletedPayload(p.OrderId, p.VendorId, p.FulfillmentType, p.RequestedAt), ct);
    }

    private Task PublishAsync<TIn, TOut>(DomainEventEnvelope<TIn> trigger, string eventType, DateTimeOffset occurredAt, TOut payload, CancellationToken ct) =>
        publisher.PublishAsync(
            new DomainEventEnvelope<TOut>(DerivedId(trigger.EventId, eventType), eventType, 1, occurredAt, "Order", trigger.AggregateId, trigger.SequenceNumber, payload, trigger.Traceparent),
            ct);

    /// <summary>The same trigger and type always give the same id (a name-based GUID over a SHA-256 of both).</summary>
    public static Guid DerivedId(Guid triggerEventId, string eventType)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{triggerEventId:N}:{eventType}"));
        return new Guid(hash.AsSpan(0, 16));
    }
}

/// <summary>Starts the strategy's three subscriptions under its own consumer name.</summary>
public sealed partial class PickupFulfillmentSubscriptions(IEventSubscriber subscriber, PickupFulfillment strategy, ILogger<PickupFulfillmentSubscriptions> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken ct)
    {
        var name = PickupFulfillment.ConsumerName;
        await subscriber.SubscribeAsync<OrderConfirmedPayload>("OrderConfirmed", strategy.OnConfirmedAsync, ct, name);
        await subscriber.SubscribeAsync<OrderReadyForFulfillmentPayload>("OrderReadyForFulfillment", strategy.OnReadyForFulfillmentAsync, ct, name);
        await subscriber.SubscribeAsync<OrderFulfillmentConfirmationRequestedPayload>(FulfillmentEventTypes.ConfirmationRequested, strategy.OnConfirmationRequestedAsync, ct, name);
        LogSubscribed(logger, name);
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "The pickup fulfillment strategy is subscribed as consumer {Consumer}")]
    private static partial void LogSubscribed(ILogger logger, string consumer);
}
