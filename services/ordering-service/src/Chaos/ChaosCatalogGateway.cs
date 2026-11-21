using BakeryMarketplace.Chaos;
using OrderingService.Checkout;

namespace OrderingService.Chaos;

/// <summary>
/// The <c>catalog</c> layer (ADR-0024): a decorator around ordering's gateway to the catalog that injects "unreachable"
/// (<c>unavailableRate</c>, the <see cref="DownstreamUnavailableException"/> the real gateway throws for a refused connection, a timeout or a 5xx),
/// a refused reservation (<c>rejectRate</c>, an ordinary "the stock changed" answer), slowness (<c>latencyMs</c>) and an outage window. Keyed by the
/// operation, the order or listing id, and the attempt number. The catalog and the real gateway are untouched.
/// </summary>
public sealed class ChaosCatalogGateway(ICatalogGateway inner, ChaosLayer layer) : ICatalogGateway
{
    private static Exception Unreachable() => new DownstreamUnavailableException("The catalog could not be reached (chaos).");

    private static Exception LostResponse() => new DownstreamUnavailableException("The catalog did not answer in time (chaos: the work was done, the response was lost).");

    private Task Before(string operation, string key, CancellationToken ct) =>
        layer.BeforeAsync(operation, key, "unavailable", "unavailableRate", Unreachable, ct);

    // Aiming (WI-CHAOS-006): a rule's key for this layer is the listing id (getListing) or the order id (reserve, release); reserve's payload is
    // { orderId, vendorId, lines: [{ listingId, quantity }] }. A call the layer does not disturb goes straight through.
    public async Task<CatalogListing?> GetListingAsync(string listingId, CancellationToken ct = default)
    {
        if (!layer.Disturbs("getListing", listingId)) return await inner.GetListingAsync(listingId, ct);
        await Before("getListing", listingId, ct);
        return await inner.GetListingAsync(listingId, ct);
    }

    public async Task<IReadOnlyCollection<string>> GetAllergenIdsAsync(CancellationToken ct = default)
    {
        if (!layer.Disturbs("getAllergenIds", "all")) return await inner.GetAllergenIdsAsync(ct);
        await Before("getAllergenIds", "all", ct);
        return await inner.GetAllergenIdsAsync(ct);
    }

    public async Task<StockReservationOutcome> ReserveAsync(
        string orderId, string vendorId, IReadOnlyList<(string ListingId, int Quantity)> lines, CancellationToken ct = default)
    {
        var payload = new { orderId, vendorId, lines = lines.Select(l => new { listingId = l.ListingId, quantity = l.Quantity }).ToArray() };
        if (!layer.Disturbs("reserve", orderId, payload)) return await inner.ReserveAsync(orderId, vendorId, lines, ct);
        await Before("reserve", orderId, ct);
        if (layer.InjectAttempt("reserve", orderId, "reject", "rejectRate"))
            return new StockReservationOutcome(false, "conflict");
        var outcome = await inner.ReserveAsync(orderId, vendorId, lines, ct);
        if (layer.LostResponse("reserve", orderId)) throw LostResponse(); // the stock is reserved; the caller is told the catalog could not be reached
        return outcome;
    }

    public async Task ReleaseAsync(string orderId, string vendorId, CancellationToken ct = default)
    {
        if (!layer.Disturbs("release", orderId, new { orderId, vendorId }))
        {
            await inner.ReleaseAsync(orderId, vendorId, ct);
            return;
        }

        await Before("release", orderId, ct);
        await inner.ReleaseAsync(orderId, vendorId, ct);
        if (layer.LostResponse("release", orderId)) throw LostResponse();
    }

    public async Task<ActiveReservationPage> ListActiveReservationsAsync(
        TimeSpan olderThan, TimeSpan notOlderThan, int limit, string? after, CancellationToken ct = default)
    {
        if (!layer.Disturbs("listActiveReservations", after ?? "first"))
            return await inner.ListActiveReservationsAsync(olderThan, notOlderThan, limit, after, ct);
        await Before("listActiveReservations", after ?? "first", ct);
        return await inner.ListActiveReservationsAsync(olderThan, notOlderThan, limit, after, ct);
    }
}
