using System.Net;
using System.Net.Http.Json;
using BakeryMarketplace.Auth;

namespace OrderingService.Checkout;

/// <summary>The part of a catalog listing that checkout needs (first-slice contract section 4). Unknown fields are ignored.</summary>
public sealed record CatalogListing(
    string Id,
    string VendorId,
    string Name,
    int PriceCents,
    string Status,
    IReadOnlyList<CatalogModifier> Modifiers,
    CatalogStock? Stock);

public sealed record CatalogModifier(string Id, int PriceDeltaCents, string? Name = null);

public sealed record CatalogStock(string Status, int? MaxPerOrder);

public sealed record StockLineRejection(string ListingId, string Reason, int? Available);

/// <summary>Whether the catalog reserved the stock. When it did not, <see cref="Code"/> and <see cref="Rejections"/> say why; nothing was reserved.</summary>
public sealed record StockReservationOutcome(bool Reserved, string? Code = null, IReadOnlyList<StockLineRejection>? Rejections = null);

/// <summary>An Active stock reservation as the orphan sweep sees it (register item 62).</summary>
public sealed record ActiveReservation(string OrderId, string VendorId, DateTimeOffset CreatedAt);

public sealed record ActiveReservationPage(IReadOnlyList<ActiveReservation> Items, string? NextCursor);

/// <summary>The catalog could not be reached, timed out, or answered in a way that is not an answer to the question (5xx, or a refused service token).</summary>
public sealed class DownstreamUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

public interface ICatalogGateway
{
    /// <summary>A published listing of a verified vendor (the catalog's public view), or null when there is none.</summary>
    Task<CatalogListing?> GetListingAsync(string listingId, CancellationToken ct = default);

    /// <summary>The ids of the allergens the catalog's registry offers today (public, ADR-0022). Throws <see cref="DownstreamUnavailableException"/> when it cannot say.</summary>
    Task<IReadOnlyCollection<string>> GetAllergenIdsAsync(CancellationToken ct = default);

    /// <summary>Reserves stock for an order (ADR-0017). Idempotent by order id.</summary>
    Task<StockReservationOutcome> ReserveAsync(
        string orderId, string vendorId, IReadOnlyList<(string ListingId, int Quantity)> lines, CancellationToken ct = default);

    /// <summary>Returns an order's reserved stock. Idempotent; an unknown reservation is fine.</summary>
    Task ReleaseAsync(string orderId, string vendorId, CancellationToken ct = default);

    /// <summary>
    /// Active reservations made between <paramref name="notOlderThan"/> and <paramref name="olderThan"/> ago, one page after the cursor
    /// <paramref name="after"/>. For the orphan sweep (register item 62) only.
    /// </summary>
    Task<ActiveReservationPage> ListActiveReservationsAsync(
        TimeSpan olderThan, TimeSpan notOlderThan, int limit, string? after, CancellationToken ct = default);
}

/// <summary>
/// Calls <c>catalog-service</c> over HTTP. Listing reads use the public endpoint without credentials; reserve and release use a client
/// that sends the service token (ADR-0018). Anything that is not a clear answer becomes <see cref="DownstreamUnavailableException"/>:
/// checkout never guesses.
/// </summary>
public sealed class CatalogGateway(IHttpClientFactory clients, ILogger<CatalogGateway> logger) : ICatalogGateway
{
    public const string PublicClientName = "catalog-public";
    public const string ServiceClientName = "catalog-service";

    public async Task<CatalogListing?> GetListingAsync(string listingId, CancellationToken ct = default)
    {
        using var response = await SendAsync(PublicClientName, HttpMethod.Get, $"/catalog/listings/{Uri.EscapeDataString(listingId)}", null, ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        if (!response.IsSuccessStatusCode) throw Unavailable("listing read", response.StatusCode);
        return await Read<CatalogListing>(response, ct);
    }

    public async Task<IReadOnlyCollection<string>> GetAllergenIdsAsync(CancellationToken ct = default)
    {
        using var response = await SendAsync(PublicClientName, HttpMethod.Get, "/catalog/tags?kind=allergen", null, ct);
        if (!response.IsSuccessStatusCode) throw Unavailable("allergen list", response.StatusCode);
        var body = await Read<TagListBody>(response, ct);
        return (body.Items ?? []).Select(t => t.Id).Where(id => !string.IsNullOrWhiteSpace(id)).ToList();
    }

    public async Task<StockReservationOutcome> ReserveAsync(
        string orderId, string vendorId, IReadOnlyList<(string ListingId, int Quantity)> lines, CancellationToken ct = default)
    {
        var body = new
        {
            orderId,
            vendorId,
            lines = lines.Select(l => new { listingId = l.ListingId, quantity = l.Quantity }).ToArray(),
        };
        using var response = await SendAsync(ServiceClientName, HttpMethod.Post, "/catalog/stock/reservations", JsonContent.Create(body), ct);

        if (response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK) return new StockReservationOutcome(true);

        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            var rejected = await Read<RejectedBody>(response, ct);
            return new StockReservationOutcome(
                false, rejected.Code,
                rejected.Lines?.Select(l => new StockLineRejection(l.ListingId, l.Reason, l.Available)).ToList() ?? []);
        }

        // 401/403 means our service credentials are wrong, 422 means we sent something the catalog does not accept: neither is the customer's doing.
        throw Unavailable("stock reservation", response.StatusCode);
    }

    public async Task ReleaseAsync(string orderId, string vendorId, CancellationToken ct = default)
    {
        using var response = await SendAsync(
            ServiceClientName, HttpMethod.Delete,
            $"/catalog/stock/reservations/{Uri.EscapeDataString(orderId)}?vendorId={Uri.EscapeDataString(vendorId)}", null, ct);
        if (response.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound) return;
        throw Unavailable("stock release", response.StatusCode);
    }

    public async Task<ActiveReservationPage> ListActiveReservationsAsync(
        TimeSpan olderThan, TimeSpan notOlderThan, int limit, string? after, CancellationToken ct = default)
    {
        var path = $"/catalog/stock/reservations?state=Active&olderThanMinutes={(int)olderThan.TotalMinutes}"
                   + $"&newerThanHours={(int)Math.Ceiling(notOlderThan.TotalHours)}&limit={limit}"
                   + (string.IsNullOrEmpty(after) ? "" : $"&after={Uri.EscapeDataString(after)}");
        using var response = await SendAsync(ServiceClientName, HttpMethod.Get, path, null, ct);
        if (!response.IsSuccessStatusCode) throw Unavailable("reservation list", response.StatusCode);
        var page = await Read<ListBody>(response, ct);
        return new ActiveReservationPage(page.Items?.Select(i => new ActiveReservation(i.OrderId, i.VendorId, i.CreatedAt)).ToList() ?? [], page.NextCursor);
    }

    private async Task<HttpResponseMessage> SendAsync(string client, HttpMethod method, string path, HttpContent? content, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(method, path) { Content = content };
            return await clients.CreateClient(client).SendAsync(request, ct);
        }
        catch (Exception e) when ((e is HttpRequestException or TaskCanceledException or ServiceTokenException) && !ct.IsCancellationRequested)
        {
            logger.LogWarning("Catalog call failed before an answer ({Client} {Method}): {Error}", client, method, e.GetType().Name);
            throw new DownstreamUnavailableException("The catalog could not be reached.", e);
        }
    }

    private DownstreamUnavailableException Unavailable(string what, HttpStatusCode status)
    {
        logger.LogWarning("Catalog {What} answered HTTP {Status}", what, (int)status);
        return new DownstreamUnavailableException($"The catalog answered HTTP {(int)status} to the {what}.");
    }

    private static async Task<T> Read<T>(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(ct) ?? throw new DownstreamUnavailableException("The catalog returned an empty body.");
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new DownstreamUnavailableException("The catalog returned a body that could not be read.", e);
        }
    }

    private sealed record TagListBody(List<TagItem>? Items);

    private sealed record TagItem(string Id);

    private sealed record ListBody(List<ListItem>? Items, string? NextCursor);

    private sealed record ListItem(string OrderId, string VendorId, DateTimeOffset CreatedAt);

    private sealed record RejectedBody(string? Code, List<RejectedLine>? Lines);

    private sealed record RejectedLine(string ListingId, string Reason, int? Available);
}
