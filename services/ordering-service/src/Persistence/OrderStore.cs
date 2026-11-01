using System.Diagnostics;
using BakeryMarketplace.Data;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>An order as read from the store, with the document it came from (its ETag guards the next write).</summary>
public sealed record StoredOrder(Order Order, OrderDocument Document);

/// <summary>
/// Stores orders through <see cref="IRepository{T}"/> in the <c>orders</c> container, partitioned by customer (WI-ORD-006, ADR-0004).
/// Creation is create-only and every later write is conditional on the ETag that was read, so two requests can never both win.
/// <para>
/// The events an order raises are written into the same document as the state change (the outbox, WI-ORD-005), never separately, so an
/// order and its pending events cannot disagree. Callers publish them afterwards and then call <see cref="TryMarkPublishedAsync"/>.
/// </para>
/// </summary>
public sealed class OrderStore(IRepository<OrderDocument> documents, IRepository<VendorOrderDocument>? vendorOrders = null)
{
    /// <summary>The caller's own order, or null. An order id alone does not say whose it is: the customer id is the partition.</summary>
    public async Task<StoredOrder?> GetAsync(string orderId, string customerId, CancellationToken ct = default)
    {
        var document = await documents.GetAsync(orderId, customerId, ct);
        return document is null ? null : new StoredOrder(document.ToOrder(), document);
    }

    /// <summary>
    /// A vendor's own order by id, or null. The vendor does not know the customer, so the order's partition is not known. When the vendor read
    /// model has the order, it names the customer and two point reads find the order. When it does not (the order is too new for its events to
    /// have been applied, or the read model is not configured) this falls back to a query across every customer's partition (open item 76).
    /// Either way the vendor id is what makes it the vendor's own order.
    /// </summary>
    public async Task<StoredOrder?> GetForVendorAsync(string orderId, string vendorId, CancellationToken ct = default)
    {
        if (vendorOrders is not null)
        {
            var summary = await vendorOrders.GetAsync(orderId, vendorId, ct);
            if (summary?.CustomerId is { } customerId)
            {
                var direct = await documents.GetAsync(orderId, customerId, ct);
                if (direct is not null && direct.VendorId == vendorId) return new StoredOrder(direct.ToOrder(), direct);
            }
        }

        await foreach (var document in documents.QueryAsync("", q => q.Where(d => d.Id == orderId && d.VendorId == vendorId).Take(1), ct))
        {
            return new StoredOrder(document.ToOrder(), document);
        }
        return null;
    }

    /// <summary>
    /// Whether an order with this id exists, for any customer. Looks across every customer's partition (the id alone does not say whose it is),
    /// so it is for background maintenance, such as the orphan reservation sweep, never a request path.
    /// </summary>
    public async Task<bool> ExistsAsync(string orderId, CancellationToken ct = default)
    {
        await foreach (var _ in documents.QueryAsync("", q => q.Where(d => d.Id == orderId).Take(1), ct)) return true;
        return false;
    }

    /// <summary>Stores a new order and its raised events together. Returns null when an order with that id already exists (a concurrent or repeated create).</summary>
    public async Task<StoredOrder?> TryCreateAsync(
        Order order, string idempotencyKey, string requestFingerprint, CancellationToken ct = default)
    {
        var document = OrderDocument.From(order, idempotencyKey, requestFingerprint);
        document.SetOutbox(NewEntries(order));
        var saved = await documents.SaveIfUnchangedAsync(document, order.CustomerId, ct);
        return saved is null ? null : new StoredOrder(order, saved);
    }

    /// <summary>
    /// Stores the order's new state and the events it raised since it was read, only if nobody changed the stored order meanwhile. Events
    /// already pending stay pending.
    /// </summary>
    public async Task<StoredOrder?> TryUpdateAsync(StoredOrder current, Order updated, CancellationToken ct = default)
    {
        var document = OrderDocument.From(updated, current.Document.IdempotencyKey, current.Document.RequestFingerprint);
        document.ETag = current.Document.ETag;
        document.ParkedAt = current.Document.ParkedAt;
        document.SetOutbox(current.Document.Outbox.Concat(NewEntries(updated)));
        var saved = await documents.SaveIfUnchangedAsync(document, updated.CustomerId, ct);
        return saved is null ? null : new StoredOrder(updated, saved);
    }

    /// <summary>
    /// Removes events the backbone has accepted from the outbox. Returns null when the order changed since it was read (the caller re-reads and
    /// tries again); removing events that are already gone is not an error.
    /// </summary>
    public async Task<StoredOrder?> TryMarkPublishedAsync(StoredOrder current, IReadOnlyCollection<string> publishedEventIds, CancellationToken ct = default)
    {
        var document = OrderDocument.From(current.Order, current.Document.IdempotencyKey, current.Document.RequestFingerprint);
        document.ETag = current.Document.ETag;
        document.ParkedAt = current.Document.ParkedAt;
        document.SetOutbox(current.Document.Outbox.Where(e => !publishedEventIds.Contains(e.EventId)));
        var saved = await documents.SaveIfUnchangedAsync(document, current.Order.CustomerId, ct);
        return saved is null ? null : new StoredOrder(current.Order, saved);
    }

    /// <summary>
    /// Counts one more failed attempt on the entry <paramref name="eventId"/> and, when it reaches <paramref name="maxAttempts"/>, parks the
    /// order's outbox at <paramref name="now"/> (register item 74). Returns null when the order changed since it was read (the caller re-reads).
    /// An entry that is no longer in the outbox is not an error: the order is returned unchanged.
    /// </summary>
    public async Task<StoredOrder?> TryRecordFailureAsync(
        StoredOrder current, string eventId, int maxAttempts, DateTimeOffset now, CancellationToken ct = default)
    {
        if (current.Document.Outbox.All(e => e.EventId != eventId)) return current;

        var entries = current.Document.Outbox.Select(e => Clone(e, e.EventId == eventId ? e.Attempts + 1 : e.Attempts)).ToList();
        var document = OrderDocument.From(current.Order, current.Document.IdempotencyKey, current.Document.RequestFingerprint);
        document.ETag = current.Document.ETag;
        document.ParkedAt = current.Document.ParkedAt
            ?? (entries.Any(e => e.Attempts >= maxAttempts) ? now.ToUnixTimeMilliseconds() : null);
        document.SetOutbox(entries);
        var saved = await documents.SaveIfUnchangedAsync(document, current.Order.CustomerId, ct);
        return saved is null ? null : new StoredOrder(current.Order, saved);
    }

    /// <summary>
    /// Puts a parked order back to work after the cause is fixed: clears the park marker and the attempt counts so the relay picks it up on
    /// its next sweep. Returns null when the order changed since it was read. An order that is not parked is returned unchanged.
    /// </summary>
    public async Task<StoredOrder?> TryUnparkAsync(StoredOrder current, CancellationToken ct = default)
    {
        if (current.Document.ParkedAt is null) return current;

        var document = OrderDocument.From(current.Order, current.Document.IdempotencyKey, current.Document.RequestFingerprint);
        document.ETag = current.Document.ETag;
        document.SetOutbox(current.Document.Outbox.Select(e => Clone(e, 0)));
        var saved = await documents.SaveIfUnchangedAsync(document, current.Order.CustomerId, ct);
        return saved is null ? null : new StoredOrder(current.Order, saved);
    }

    /// <summary>Orders whose outbox is parked, for an operator or an alert. Looks across every customer's partition: not for request paths.</summary>
    public async Task<IReadOnlyList<StoredOrder>> FindParkedAsync(int take, CancellationToken ct = default)
    {
        var found = new List<StoredOrder>();
        await foreach (var document in documents.QueryAsync("", q => q.Where(d => d.ParkedAt > 0).Take(take), ct))
        {
            found.Add(new StoredOrder(document.ToOrder(), document));
        }
        return found;
    }

    private static OutboxEntryDocument Clone(OutboxEntryDocument e, int attempts) => new()
    {
        EventId = e.EventId,
        EventType = e.EventType,
        SequenceNumber = e.SequenceNumber,
        OccurredAt = e.OccurredAt,
        PayloadJson = e.PayloadJson,
        Traceparent = e.Traceparent,
        Attempts = attempts,
    };

    /// <summary>
    /// Orders whose oldest pending event is at or before <paramref name="pendingBefore"/>. Looks across every
    /// customer's partition, so it is for the background relay only, never a request path.
    /// </summary>
    public async Task<IReadOnlyList<StoredOrder>> FindPendingAsync(DateTimeOffset pendingBefore, int take, CancellationToken ct = default)
    {
        var cutoff = pendingBefore.ToUnixTimeMilliseconds();
        var found = new List<StoredOrder>();
        await foreach (var document in documents.QueryAsync("", q => q.Where(d => d.PendingSince <= cutoff).Take(take), ct))
        {
            found.Add(new StoredOrder(document.ToOrder(), document));
        }
        return found;
    }

    private static List<OutboxEntryDocument> NewEntries(Order order)
    {
        var traceparent = Activity.Current is { IdFormat: ActivityIdFormat.W3C } activity ? activity.Id : null;
        return order.DequeueEvents().Select(e => OutboxEntryDocument.From(order.Id, e, traceparent)).ToList();
    }
}
