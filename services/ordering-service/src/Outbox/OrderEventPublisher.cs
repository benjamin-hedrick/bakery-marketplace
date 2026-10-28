using System.Text.Json;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using OrderingService.Persistence;

namespace OrderingService.Outbox;

/// <summary>How many of an order's pending events were published, and whether publishing stopped early.</summary>
public sealed record PublishResult(int Published, bool Failed)
{
    public static readonly PublishResult Nothing = new(0, false);
}

/// <summary>
/// Publishes an order's pending events through <see cref="IEventPublisher"/> and then removes them from the outbox (WI-ORD-005, ADR-0003).
/// Delivery is at-least-once: if the process stops after publishing but before the cleanup, the same events are published again with the
/// same event ids, and consumers dedupe on the id. Events go out in sequence order and publishing stops at the first failure, so a consumer
/// never sees a later event of an order without the earlier ones having been sent first.
/// </summary>
public sealed class OrderEventPublisher(IEventPublisher events, OrderStore orders, ILogger<OrderEventPublisher> logger)
{
    private const int MaxCleanupAttempts = 5;

    private static readonly Dictionary<string, Func<OutboxEntryDocument, string, IEventPublisher, CancellationToken, Task>> Senders = new()
    {
        [OrderEventTypes.Placed] = Send<OrderPlacedPayload>,
        [OrderEventTypes.Confirmed] = Send<OrderConfirmedPayload>,
        [OrderEventTypes.PreparationStarted] = Send<OrderPreparationStartedPayload>,
        [OrderEventTypes.ReadyForFulfillment] = Send<OrderReadyForFulfillmentPayload>,
        [OrderEventTypes.Completed] = Send<OrderCompletedPayload>,
        [OrderEventTypes.Cancelled] = Send<OrderCancelledPayload>,
    };

    public async Task<PublishResult> PublishPendingAsync(StoredOrder stored, CancellationToken ct = default)
    {
        var pending = stored.Document.Outbox.OrderBy(e => e.SequenceNumber).ToList();
        if (pending.Count == 0) return PublishResult.Nothing;

        var published = new List<string>();
        var failed = false;
        foreach (var entry in pending)
        {
            try
            {
                if (!Senders.TryGetValue(entry.EventType, out var send))
                    throw new InvalidOperationException($"No payload type is known for event type '{entry.EventType}'.");
                await send(entry, stored.Order.Id, events, ct);
                published.Add(entry.EventId);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                logger.LogWarning(e, "Event {EventType} #{Sequence} of order {OrderId} could not be published; it stays pending",
                    entry.EventType, entry.SequenceNumber, stored.Order.Id);
                failed = true;
                break; // later events wait: they must not overtake this one
            }
        }

        if (published.Count > 0) await RemoveAsync(stored, published, ct);
        return new PublishResult(published.Count, failed);
    }

    /// <summary>Removes the published entries. If the order changed meanwhile, re-reads it and tries again; failing to clean up is safe (a repeat is deduped).</summary>
    private async Task RemoveAsync(StoredOrder stored, List<string> publishedIds, CancellationToken ct)
    {
        var current = stored;
        for (var attempt = 0; attempt < MaxCleanupAttempts; attempt++)
        {
            if (await orders.TryMarkPublishedAsync(current, publishedIds, ct) is not null) return;

            var fresh = await orders.GetAsync(stored.Order.Id, stored.Order.CustomerId, ct);
            if (fresh is null || !fresh.Document.Outbox.Any(e => publishedIds.Contains(e.EventId))) return; // already cleaned by someone else
            current = fresh;
        }
        logger.LogWarning("Order {OrderId}: published events could not be removed from the outbox; they will be sent again with the same ids", stored.Order.Id);
    }

    private static Task Send<T>(OutboxEntryDocument entry, string orderId, IEventPublisher events, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<T>(entry.PayloadJson, OutboxEntryDocument.Json)
            ?? throw new InvalidOperationException($"The stored payload of {entry.EventType} could not be read.");
        return events.PublishAsync(
            new DomainEventEnvelope<T>(
                Guid.Parse(entry.EventId), entry.EventType, 1, entry.OccurredAt, "Order", orderId, entry.SequenceNumber, payload, entry.Traceparent),
            ct);
    }
}
