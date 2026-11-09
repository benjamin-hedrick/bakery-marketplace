using BakeryMarketplace.Data;
using CatalogService.Domain;

namespace CatalogService.Services;

public enum ReservationOutcome
{
    Reserved,
    AlreadyReserved,
    Released,
    AlreadyReleased,
    Rejected,
    NotFound,
    ReservationReleased,
    DifferentLines,
    Conflict,
}

/// <summary>Why one line could not be reserved. <see cref="Available"/> is set for <see cref="StockRejections.InsufficientStock"/>.</summary>
public sealed record LineRejection(string ListingId, string Reason, int? Available = null);

public static class StockRejections
{
    public const string ListingNotFound = "listing_not_found";
    public const string NotAvailable = "not_available";
    public const string ExceedsMaxPerOrder = "exceeds_max_per_order";
    public const string InsufficientStock = "insufficient_stock";
}

public sealed record ReservationResult(
    ReservationOutcome Outcome, StockReservationDocument? Reservation = null, IReadOnlyList<LineRejection>? Rejections = null);

/// <summary>
/// Reserves and releases stock for an order (ADR-0017, WI-CAT-006). A reservation decrements every limited-stock listing and writes its own
/// record in one transactional batch (all lines belong to one vendor, so they share a partition), so it applies completely or not at
/// all and can never oversell. It is keyed by the order id: repeating the same reserve or release is safe. A batch that loses a race
/// (someone changed a listing after it was read) is re-read and retried.
/// </summary>
public sealed class StockReservationService
{
    private readonly IRepository<ListingDocument> _listings;
    private readonly IRepository<StockReservationDocument> _reservations;
    private readonly IBatchFactory _batches;
    private readonly VendorStatusStore _vendors;
    private readonly ListingEventPublisher _events;
    private readonly TimeProvider _time;
    private readonly ListingCache _cache;

    public StockReservationService(
        IRepository<ListingDocument> listings,
        IRepository<StockReservationDocument> reservations,
        IBatchFactory batches,
        VendorStatusStore vendors,
        ListingEventPublisher events,
        TimeProvider time,
        ListingCache cache)
    {
        _cache = cache;
        _listings = listings;
        _reservations = reservations;
        _batches = batches;
        _vendors = vendors;
        _events = events;
        _time = time;
    }

    public async Task<ReservationResult> ReserveAsync(
        string orderId, string vendorId, IEnumerable<(string ListingId, int Quantity)> requested, CancellationToken ct = default)
    {
        // Several lines for one listing (the same item with different modifiers) are summed: stock is per listing.
        var wanted = requested
            .GroupBy(l => l.ListingId, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.Sum(l => (long)l.Quantity), StringComparer.Ordinal);
        var reservationId = StockReservationDocument.IdFor(orderId);

        for (var attempt = 0; attempt < ListingService.MaxSaveAttempts; attempt++)
        {
            var existing = await _reservations.GetAsync(reservationId, vendorId, ct);
            if (existing is not null)
            {
                if (existing.State == ReservationStates.Released) return new ReservationResult(ReservationOutcome.ReservationReleased, existing);
                return SameLines(existing, wanted)
                    ? new ReservationResult(ReservationOutcome.AlreadyReserved, existing)
                    : new ReservationResult(ReservationOutcome.DifferentLines, existing);
            }

            if (!await _vendors.IsVerifiedAsync(vendorId, ct))
            {
                return new ReservationResult(ReservationOutcome.Rejected,
                    Rejections: wanted.Keys.Select(id => new LineRejection(id, StockRejections.NotAvailable)).ToList());
            }

            var docs = new Dictionary<string, ListingDocument>(StringComparer.Ordinal);
            var rejections = new List<LineRejection>();
            foreach (var (listingId, quantity) in wanted)
            {
                var doc = await _listings.GetAsync(listingId, vendorId, ct);
                if (doc is null) rejections.Add(new LineRejection(listingId, StockRejections.ListingNotFound));
                else if (doc.Status != ListingStatuses.Published) rejections.Add(new LineRejection(listingId, StockRejections.NotAvailable));
                else if (quantity > StockPolicy.MaxQuantity || (doc.MaxPerOrder is { } max && quantity > max))
                    rejections.Add(new LineRejection(listingId, StockRejections.ExceedsMaxPerOrder));
                else if (doc.AvailableQuantity is { } available && quantity > available)
                    rejections.Add(new LineRejection(listingId, StockRejections.InsufficientStock, available));
                else docs[listingId] = doc;
            }
            if (rejections.Count > 0) return new ReservationResult(ReservationOutcome.Rejected, Rejections: rejections);

            var now = _time.GetUtcNow();
            var batch = _batches.CreateBatch(vendorId);
            var crossedIntoLow = new List<ListingDocument>();
            var lines = new List<ReservationLineDocument>();
            var statusChanged = false; // a customer-visible change of any listing: the cached copy must go (see ListingCache)
            foreach (var (listingId, quantity) in wanted)
            {
                var doc = docs[listingId];
                var limited = doc.AvailableQuantity is not null;
                if (limited)
                {
                    var wasLowOrOut = StockPolicy.IsLowOrOut(doc);
                    var statusBefore = StockPolicy.StatusOf(doc);
                    doc.AvailableQuantity -= (int)quantity;
                    doc.UpdatedAt = now;
                    doc.Version++;
                    statusChanged |= StockPolicy.StatusOf(doc) != statusBefore;
                    if (!wasLowOrOut && StockPolicy.IsLowOrOut(doc))
                    {
                        _events.Raise(doc, ListingEventTypes.LowStockDetected); // stored in the same batch as the decrement (register item 30)
                        crossedIntoLow.Add(doc);
                    }
                    batch.ReplaceIfUnchanged(doc);
                }
                lines.Add(new ReservationLineDocument { ListingId = listingId, Quantity = (int)quantity, Limited = limited });
            }

            var reservation = new StockReservationDocument
            {
                Id = reservationId,
                VendorId = vendorId,
                OrderId = orderId,
                State = ReservationStates.Active,
                Lines = lines,
                CreatedAt = now,
                CreatedAtMs = now.ToUnixTimeMilliseconds(),
            };
            batch.Create(reservation);

            if (await batch.ExecuteAsync(ct))
            {
                if (statusChanged) await _cache.InvalidateVendorAsync(vendorId);
                foreach (var doc in crossedIntoLow) await _events.PublishInlineAsync(doc);
                return new ReservationResult(ReservationOutcome.Reserved, reservation);
            }
            // A listing changed, or a concurrent request created this reservation: start again from fresh reads.
        }
        return new ReservationResult(ReservationOutcome.Conflict);
    }

    public async Task<ReservationResult> ReleaseAsync(string orderId, string vendorId, CancellationToken ct = default)
    {
        var reservationId = StockReservationDocument.IdFor(orderId);

        for (var attempt = 0; attempt < ListingService.MaxSaveAttempts; attempt++)
        {
            var reservation = await _reservations.GetAsync(reservationId, vendorId, ct);
            if (reservation is null) return new ReservationResult(ReservationOutcome.NotFound);
            if (reservation.State == ReservationStates.Released) return new ReservationResult(ReservationOutcome.AlreadyReleased, reservation);

            var now = _time.GetUtcNow();
            var batch = _batches.CreateBatch(vendorId);
            var statusChanged = false;
            foreach (var line in reservation.Lines.Where(l => l.Limited))
            {
                // Only stock that was actually taken comes back, and only into a listing that is still limited-stock.
                var doc = await _listings.GetAsync(line.ListingId, vendorId, ct);
                if (doc?.AvailableQuantity is not { } current) continue;
                var statusBefore = StockPolicy.StatusOf(doc);
                doc.AvailableQuantity = (int)Math.Min((long)current + line.Quantity, StockPolicy.MaxQuantity);
                statusChanged |= StockPolicy.StatusOf(doc) != statusBefore;
                doc.UpdatedAt = now;
                doc.Version++;
                batch.ReplaceIfUnchanged(doc);
            }
            reservation.State = ReservationStates.Released;
            reservation.ReleasedAt = now;
            reservation.TimeToLiveSeconds = (int)StockReservationDocument.ReleasedRetention.TotalSeconds;
            batch.ReplaceIfUnchanged(reservation);

            if (await batch.ExecuteAsync(ct))
            {
                if (statusChanged) await _cache.InvalidateVendorAsync(vendorId);
                return new ReservationResult(ReservationOutcome.Released, reservation);
            }
        }
        return new ReservationResult(ReservationOutcome.Conflict);
    }

    /// <summary>
    /// Active reservations made between <paramref name="notOlderThan"/> and <paramref name="olderThan"/> ago, ordered by id, for the ordering
    /// service's orphan sweep (register item 62). Looks across every vendor's partition, so it is for that background job only. The window
    /// has a far end because a reservation stays Active for the life of its order: without it every order ever placed would be listed.
    /// </summary>
    public async Task<IReadOnlyList<StockReservationDocument>> ListActiveAsync(
        TimeSpan olderThan, TimeSpan notOlderThan, int limit, string? after, CancellationToken ct = default)
    {
        var now = _time.GetUtcNow();
        var newest = now.Subtract(olderThan).ToUnixTimeMilliseconds();
        var oldest = now.Subtract(notOlderThan).ToUnixTimeMilliseconds();
        // The window is filtered by the store; the order and the cursor are applied here, like the public browse, because a string
        // comparison is not something to rely on a store query to translate.
        var inWindow = new List<StockReservationDocument>();
        await foreach (var doc in _reservations.QueryAsync("", q => q.Where(d =>
                           d.DocType == "stockReservation" && d.State == ReservationStates.Active
                           && d.CreatedAtMs <= newest && d.CreatedAtMs >= oldest), ct))
        {
            inWindow.Add(doc);
        }

        return inWindow
            .OrderBy(d => d.Id, StringComparer.Ordinal)
            .Where(d => string.IsNullOrEmpty(after) || string.CompareOrdinal(d.Id, after) > 0)
            .Take(limit)
            .ToList();
    }

    private static bool SameLines(StockReservationDocument existing, Dictionary<string, long> wanted) =>
        existing.Lines.Count == wanted.Count
        && existing.Lines.All(l => wanted.TryGetValue(l.ListingId, out var quantity) && quantity == l.Quantity);
}
