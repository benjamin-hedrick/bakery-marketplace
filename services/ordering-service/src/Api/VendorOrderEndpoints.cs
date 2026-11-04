using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Persistence;

namespace OrderingService.Api;

public sealed record VendorOrderModifierDto(string Id, string? Name);

/// <summary>
/// One line of an order for the vendor: ids from the event, with the names the ordering service holds in <see cref="ListingNameCache"/> (register
/// item 113). A name is null when the catalog has no such listing or modifier, or could not be asked; the id is always there.
/// </summary>
public sealed record VendorOrderLineDto(string ListingId, string? ListingName, IReadOnlyList<VendorOrderModifierDto> Modifiers, int Quantity);

/// <summary>
/// One order for the vendor, in the list and as a single read: everything needed to decide on it without a second read (what was ordered, the
/// requested window and instructions, the total). The customer is not named: the vendor needs the order, not who placed it.
/// </summary>
public sealed record VendorOrderDto(
    string Id,
    string Reference,
    string Status,
    long? TotalCents,
    string? Currency,
    int? LineCount,
    int? ItemCount,
    string? FulfillmentType,
    PickupWindowDto? PickupWindow,
    bool Automatic,
    string? CancelledBy,
    string? CancelReason,
    DateTimeOffset? PlacedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<VendorOrderLineDto> Lines,
    string? PickupInstructions,
    long LastSequence,
    IReadOnlyList<string> Allergens)
{
    public static VendorOrderDto From(VendorOrderDocument d, IReadOnlyDictionary<string, ListingNames> names) => new(
        d.Id, OrderReference.For(d.Id), d.Status.ToString(), d.TotalCents, d.Currency, d.LineCount, d.ItemCount, d.FulfillmentType?.ToString(),
        d.PickupStart is { } start && d.PickupEnd is { } end ? new PickupWindowDto(start, end) : null,
        d.Automatic, d.CancelledBy?.ToString(), d.CancelReason?.ToString(), d.PlacedAt, d.UpdatedAt,
        (d.Lines ?? []).Select(l =>
        {
            var known = names.GetValueOrDefault(l.ListingId);
            return new VendorOrderLineDto(
                l.ListingId, known?.Name,
                l.ModifierIds.Select(m => new VendorOrderModifierDto(m, known?.Modifiers.GetValueOrDefault(m))).ToList(), l.Quantity);
        }).ToList(), d.PickupInstructions, d.LastSequence, d.Allergens ?? []);
}

public sealed record VendorOrderPage(IReadOnlyList<VendorOrderDto> Items, string? NextCursor);

/// <summary>
/// The vendor's "my orders" list (register item 76), read from the vendor order read model: one partition, newest change first. The vendor id
/// always comes from the token. The read model is fed by events, so an order appears a moment after it is placed or changes.
/// </summary>
public static class VendorOrderEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapVendorOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/ordering/vendor/orders", async (string? status, int? limit, string? after, HttpContext http, VendorOrderReader reader, ListingNameCache names, CancellationToken ct) =>
        {
            var vendorId = CheckoutEndpoints.SubjectOf(http.User);
            if (vendorId is null) return Results.Unauthorized();

            var filter = VendorOrderReader.ParseStatus(status);
            if (filter is null)
            {
                return Results.Json(
                    new ApiError("validation_failed", "The request is invalid.",
                        new Dictionary<string, string[]> { ["status"] = [$"active, or one of: {string.Join(", ", Enum.GetNames<OrderStatus>().Where(n => n != nameof(OrderStatus.Pending)))}."] }),
                    statusCode: StatusCodes.Status422UnprocessableEntity);
            }
            if (!VendorOrderReader.IsValidCursor(after))
            {
                return Results.Json(
                    new ApiError("validation_failed", "The request is invalid.", new Dictionary<string, string[]> { ["after"] = ["Not a cursor from a previous page."] }),
                    statusCode: StatusCodes.Status422UnprocessableEntity);
            }

            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await reader.ListAsync(vendorId, filter, size, after, ct);
            var known = await names.GetManyAsync(items.SelectMany(i => i.Lines ?? []).Select(l => l.ListingId), ct);
            return Results.Ok(new VendorOrderPage(items.Select(i => VendorOrderDto.From(i, known)).ToList(), next));
        }).RequireAuthorization("VendorRole");

        // One order: a point read of the read model in the vendor's own partition (the vendor id from the token). Another vendor's order, and one
        // that does not exist or has not reached the read model yet, look the same (404).
        app.MapGet("/ordering/vendor/orders/{id}", async (string id, HttpContext http, IRepository<VendorOrderDocument> documents, ListingNameCache names, CancellationToken ct) =>
        {
            var vendorId = CheckoutEndpoints.SubjectOf(http.User);
            if (vendorId is null) return Results.Unauthorized();

            var doc = await documents.GetAsync(id, vendorId, ct);
            if (doc is null) return Results.Json(new ApiError("not_found", "Order not found."), statusCode: StatusCodes.Status404NotFound);
            return Results.Ok(VendorOrderDto.From(doc, await names.GetManyAsync((doc.Lines ?? []).Select(l => l.ListingId), ct)));
        }).RequireAuthorization("VendorRole");

        return app;
    }
}
