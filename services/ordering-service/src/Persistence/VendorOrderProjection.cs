using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>
/// Applies the order events to the vendor order read model (<c>N-03</c>). Every method is safe to repeat and to run out of order, because the
/// transport delivers at least once and a redelivered event can arrive after later ones (register item 112):
/// the status only moves to the event with the highest sequence number, while the facts only one event carries (the totals of
/// <c>OrderPlaced</c>, the pickup window of <c>OrderConfirmed</c>, the reason of <c>OrderCancelled</c>) are recorded whenever that event arrives.
/// A lost race with another writer re-reads and applies the event again.
/// </summary>
public sealed class VendorOrderProjection(IRepository<VendorOrderDocument> documents, ILogger<VendorOrderProjection> logger)
{
    private const int MaxAttempts = 20;

    public Task OnPlacedAsync(DomainEventEnvelope<OrderPlacedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Placed, d =>
        {
            d.TotalCents = e.Payload.TotalCents;
            d.Currency = e.Payload.Currency;
            d.LineCount = e.Payload.LineItems.Count;
            d.ItemCount = e.Payload.LineItems.Sum(l => l.Quantity);
            d.PlacedAt = e.OccurredAt;
        }, ct);

    public Task OnConfirmedAsync(DomainEventEnvelope<OrderConfirmedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Confirmed, d =>
        {
            // Facts are filled in, never cleared: a repeat or an older-schema event without details must not blank what an earlier one recorded.
            d.Automatic |= e.Payload.Automatic;
            d.FulfillmentType = e.Payload.FulfillmentType ?? d.FulfillmentType;
            d.PickupStart = e.Payload.Details?.Pickup?.WindowStart ?? d.PickupStart;
            d.PickupEnd = e.Payload.Details?.Pickup?.WindowEnd ?? d.PickupEnd;
        }, ct);

    public Task OnPreparationStartedAsync(DomainEventEnvelope<OrderPreparationStartedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.InPreparation, _ => { }, ct);

    public Task OnReadyForFulfillmentAsync(DomainEventEnvelope<OrderReadyForFulfillmentPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.ReadyForFulfillment, _ => { }, ct);

    public Task OnCompletedAsync(DomainEventEnvelope<OrderCompletedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Completed, _ => { }, ct);

    public Task OnCancelledAsync(DomainEventEnvelope<OrderCancelledPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Cancelled, d =>
        {
            d.CancelledBy = e.Payload.CancelledBy;
            d.CancelReason = e.Payload.Reason;
        }, ct);

    private async Task ApplyAsync<T>(
        string orderId, string? vendorId, string? customerId, DomainEventEnvelope<T> e, OrderStatus status, Action<VendorOrderDocument> facts, CancellationToken ct)
    {
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var existing = vendorId is null ? await FindAnywhereAsync(orderId, ct) : await documents.GetAsync(orderId, vendorId, ct);
            vendorId ??= existing?.VendorId;
            if (vendorId is null)
            {
                // An event from before the vendor id was added to the payloads, for an order the read model has not seen: there is no partition to put it in.
                logger.LogWarning(
                    "Event {EventType} #{Sequence} of order {OrderId} carries no vendor id and the order is not in the vendor read model; it was skipped",
                    e.EventType, e.SequenceNumber, orderId);
                return;
            }

            var doc = existing ?? new VendorOrderDocument { Id = orderId, VendorId = vendorId };
            doc.CustomerId ??= customerId;
            facts(doc);
            if (existing is null || e.SequenceNumber > doc.LastSequence)
            {
                doc.Status = status;
                doc.LastSequence = e.SequenceNumber;
                doc.UpdatedAt = e.OccurredAt;
                doc.UpdatedAtMs = e.OccurredAt.ToUnixTimeMilliseconds();
            }

            if (await documents.SaveIfUnchangedAsync(doc, vendorId, ct) is not null) return;
        }
        throw new InvalidOperationException($"The vendor read model of order {orderId} kept changing under {e.EventType}; the event will be delivered again.");
    }

    private async Task<VendorOrderDocument?> FindAnywhereAsync(string orderId, CancellationToken ct)
    {
        await foreach (var d in documents.QueryAsync("", q => q.Where(x => x.Id == orderId).Take(1), ct)) return d;
        return null;
    }
}
