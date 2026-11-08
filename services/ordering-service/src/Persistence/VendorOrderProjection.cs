using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Newtonsoft.Json;
using OrderingService.Domain;
using OrderingService.Streaming;

namespace OrderingService.Persistence;

/// <summary>
/// Applies the order events to the vendor order read model (<c>N-03</c>). Every method is safe to repeat and to run out of order, because the
/// transport delivers at least once and a redelivered event can arrive after later ones (register item 112):
/// the status only moves to the event with the highest sequence number, while the facts only one event carries (the totals of
/// <c>OrderPlaced</c>, the pickup window of <c>OrderConfirmed</c>, the reason of <c>OrderCancelled</c>) are recorded whenever that event arrives.
/// A lost race with another writer re-reads and applies the event again.
/// </summary>
public sealed partial class VendorOrderProjection(
    IRepository<VendorOrderDocument> documents, ILogger<VendorOrderProjection> logger, IBroadcastPublisher? broadcast = null)
{
    private const int MaxAttempts = 20;

    public Task OnPlacedAsync(DomainEventEnvelope<OrderPlacedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Placed, d =>
        {
            d.TotalCents = e.Payload.TotalCents;
            d.Currency = e.Payload.Currency;
            d.LineCount = e.Payload.LineItems.Count;
            d.ItemCount = e.Payload.LineItems.Sum(l => l.Quantity);
            d.Lines = e.Payload.LineItems.Select(l => new VendorOrderLineDocument
            {
                ListingId = l.ListingId,
                ModifierIds = l.ModifierIds.ToList(),
                Quantity = l.Quantity,
            }).ToList();
            d.PlacedAt = e.OccurredAt;
            // Set once: a repeat or a late copy of the event never changes what the customer chose (WI-ORD-009).
            if (d.Allergens is null && e.Payload.Allergens is { Count: > 0 } allergens) d.Allergens = allergens.ToList();
            ApplyFulfillment(d, e.Payload.FulfillmentType, e.Payload.Details);
        }, ct);

    public Task OnConfirmedAsync(DomainEventEnvelope<OrderConfirmedPayload> e, CancellationToken ct) =>
        ApplyAsync(e.Payload.OrderId, e.Payload.VendorId, e.Payload.CustomerId, e, OrderStatus.Confirmed, d =>
        {
            // Facts are filled in, never cleared: a repeat or an older-schema event without details must not blank what an earlier one recorded.
            d.Automatic |= e.Payload.Automatic;
            ApplyFulfillment(d, e.Payload.FulfillmentType, e.Payload.Details);
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

    private static void ApplyFulfillment(VendorOrderDocument d, FulfillmentType? type, FulfillmentDetails? details)
    {
        d.FulfillmentType = type ?? d.FulfillmentType;
        d.PickupStart = details?.Pickup?.WindowStart ?? d.PickupStart;
        d.PickupEnd = details?.Pickup?.WindowEnd ?? d.PickupEnd;
        d.PickupInstructions = details?.Pickup?.Instructions ?? d.PickupInstructions;
    }

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
                LogEventWithoutVendor(logger, e.EventType, e.SequenceNumber, orderId);
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

            if (await documents.SaveIfUnchangedAsync(doc, vendorId, ct) is { } saved)
            {
                await AnnounceAsync(saved, vendorId, ct);
                return;
            }
        }
        throw new InvalidOperationException($"The vendor read model of order {orderId} kept changing under {e.EventType}; the event will be delivered again.");
    }

    /// <summary>
    /// Tells the vendor's open streams, on every instance, that the order changed (ADR-0021). A nudge, not a fact: if it is lost the next change or the
    /// vendor screen's poll repairs it, so a failure here is logged and never fails the event (which would be redelivered for nothing).
    /// </summary>
    private async Task AnnounceAsync(VendorOrderDocument saved, string vendorId, CancellationToken ct)
    {
        if (broadcast is null) return;
        try
        {
            await broadcast.PublishAsync(VendorOrderChannels.For(vendorId), JsonConvert.SerializeObject(saved), ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogLiveUpdateFailed(logger, e, saved.Id);
        }
    }

    private async Task<VendorOrderDocument?> FindAnywhereAsync(string orderId, CancellationToken ct)
    {
        await foreach (var d in documents.QueryAsync("", q => q.Where(x => x.Id == orderId).Take(1), ct)) return d;
        return null;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Event {EventType} #{Sequence} of order {OrderId} carries no vendor id and the order is not in the vendor read model; it was skipped")]
    private static partial void LogEventWithoutVendor(ILogger logger, string eventType, long sequence, string orderId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The live update of order {OrderId} could not be published; the vendor screen will catch up by polling")]
    private static partial void LogLiveUpdateFailed(ILogger logger, Exception exception, string orderId);
}
