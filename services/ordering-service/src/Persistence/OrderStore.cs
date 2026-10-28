using BakeryMarketplace.Data;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>An order as read from the store, with the document it came from (its ETag guards the next write).</summary>
public sealed record StoredOrder(Order Order, OrderDocument Document);

/// <summary>
/// Stores orders through <see cref="IRepository{T}"/> in the <c>orders</c> container, partitioned by customer (WI-ORD-006, ADR-0004).
/// Creation is create-only and every later write is conditional on the ETag that was read, so two requests can never both win.
/// </summary>
public sealed class OrderStore(IRepository<OrderDocument> documents)
{
    /// <summary>The caller's own order, or null. An order id alone does not say whose it is: the customer id is the partition.</summary>
    public async Task<StoredOrder?> GetAsync(string orderId, string customerId, CancellationToken ct = default)
    {
        var document = await documents.GetAsync(orderId, customerId, ct);
        return document is null ? null : new StoredOrder(document.ToOrder(), document);
    }

    /// <summary>Stores a new order. Returns null when an order with that id already exists (a concurrent or repeated create).</summary>
    public async Task<StoredOrder?> TryCreateAsync(
        Order order, string idempotencyKey, string requestFingerprint, CancellationToken ct = default)
    {
        var saved = await documents.SaveIfUnchangedAsync(OrderDocument.From(order, idempotencyKey, requestFingerprint), order.CustomerId, ct);
        return saved is null ? null : new StoredOrder(order, saved);
    }

    /// <summary>Stores the order's new state only if nobody changed the stored order since <paramref name="current"/> was read.</summary>
    public async Task<StoredOrder?> TryUpdateAsync(StoredOrder current, Order updated, CancellationToken ct = default)
    {
        var document = OrderDocument.From(updated, current.Document.IdempotencyKey, current.Document.RequestFingerprint);
        document.ETag = current.Document.ETag;
        var saved = await documents.SaveIfUnchangedAsync(document, updated.CustomerId, ct);
        return saved is null ? null : new StoredOrder(updated, saved);
    }
}
