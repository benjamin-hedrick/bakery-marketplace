using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;

namespace OrderingService.Persistence;

/// <summary>
/// Reads the vendor order read model (register item 76). One partition per vendor, so a vendor's list costs in proportion to that vendor's
/// own orders and never touches anyone else's. Filtering, ordering and the cursor are applied here rather than in the store query, as in the
/// catalog's browse: a store query is not something to rely on to translate a stored enum or a composite cursor. That means the whole partition
/// of one vendor is read for each page; revisit with a store-side ordering when a vendor can have many thousands of orders.
/// </summary>
public sealed class VendorOrderReader(IRepository<VendorOrderDocument> documents)
{
    private static readonly OrderStatus[] Active =
        [OrderStatus.Placed, OrderStatus.Confirmed, OrderStatus.InPreparation, OrderStatus.ReadyForFulfillment];

    /// <summary>
    /// No value means every status a vendor can see; <c>active</c> means those still in progress; otherwise one status name. Null when the value is
    /// not one of those. <c>Pending</c> is never offered: a customer still building an order has not reached the vendor.
    /// </summary>
    public static OrderStatus[]? ParseStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return [.. Active, OrderStatus.Completed, OrderStatus.Cancelled];
        if (string.Equals(status, "active", StringComparison.OrdinalIgnoreCase)) return Active;
        return Enum.TryParse<OrderStatus>(status, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed) && parsed != OrderStatus.Pending
            ? [parsed]
            : null;
    }

    /// <summary>A cursor is the update time and id of the last item of the previous page, <c>{milliseconds}:{id}</c>.</summary>
    public static bool IsValidCursor(string? after) => after is null || TryParseCursor(after, out _, out _);

    private static bool TryParseCursor(string after, out long milliseconds, out string id)
    {
        milliseconds = 0;
        id = "";
        var colon = after.IndexOf(':');
        if (colon < 1 || colon == after.Length - 1 || after.Length > 200) return false;
        id = after[(colon + 1)..];
        return long.TryParse(after.AsSpan(0, colon), out milliseconds);
    }

    /// <summary>The vendor's orders in the given statuses, the most recently changed first, one page after the cursor.</summary>
    public async Task<(IReadOnlyList<VendorOrderDocument> Items, string? NextCursor)> ListAsync(
        string vendorId, OrderStatus[] statuses, int limit, string? after, CancellationToken ct = default)
    {
        var all = new List<VendorOrderDocument>();
        await foreach (var d in documents.QueryAsync(vendorId, q => q.Where(x => x.UpdatedAtMs > 0), ct))
        {
            if (statuses.Contains(d.Status)) all.Add(d);
        }

        var ordered = all.OrderByDescending(d => d.UpdatedAtMs).ThenBy(d => d.Id, StringComparer.Ordinal).AsEnumerable();
        if (after is not null && TryParseCursor(after, out var ms, out var id))
        {
            // Strictly after the cursor in the list's own order: older, or the same instant with a later id.
            ordered = ordered.Where(d => d.UpdatedAtMs < ms || (d.UpdatedAtMs == ms && string.CompareOrdinal(d.Id, id) > 0));
        }

        var page = ordered.Take(limit + 1).ToList();
        var items = page.Take(limit).ToList();
        return (items, page.Count > limit ? $"{items[^1].UpdatedAtMs}:{items[^1].Id}" : null);
    }
}
