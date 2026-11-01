using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using OrderingService.Persistence;

namespace OrderingService.Api;

/// <summary>One line of an order for the vendor, as ids; the vendor view turns them into names (register item 113).</summary>
public sealed record VendorOrderLineDto(string ListingId, IReadOnlyList<string> ModifierIds, int Quantity);

/// <summary>
/// One order for the vendor, in the list and as a single read: everything needed to decide on it without a second read (what was ordered, the
/// requested window and instructions, the total). The customer is not named: the vendor needs the order, not who placed it.
/// </summary>
public sealed record VendorOrderDto(
    string Id,
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
    string? PickupInstructions)
{
    public static VendorOrderDto From(VendorOrderDocument d) => new(
        d.Id, d.Status.ToString(), d.TotalCents, d.Currency, d.LineCount, d.ItemCount, d.FulfillmentType?.ToString(),
        d.PickupStart is { } start && d.PickupEnd is { } end ? new PickupWindowDto(start, end) : null,
        d.Automatic, d.CancelledBy?.ToString(), d.CancelReason?.ToString(), d.PlacedAt, d.UpdatedAt,
        (d.Lines ?? []).Select(l => new VendorOrderLineDto(l.ListingId, l.ModifierIds, l.Quantity)).ToList(), d.PickupInstructions);
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
        app.MapGet("/ordering/vendor/orders", async (string? status, int? limit, string? after, HttpContext http, VendorOrderReader reader, CancellationToken ct) =>
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
            return Results.Ok(new VendorOrderPage(items.Select(VendorOrderDto.From).ToList(), next));
        }).RequireAuthorization("VendorRole");

        // One order: a point read of the read model in the vendor's own partition (the vendor id from the token). Another vendor's order, and one
        // that does not exist or has not reached the read model yet, look the same (404).
        app.MapGet("/ordering/vendor/orders/{id}", async (string id, HttpContext http, IRepository<VendorOrderDocument> documents, CancellationToken ct) =>
        {
            var vendorId = CheckoutEndpoints.SubjectOf(http.User);
            if (vendorId is null) return Results.Unauthorized();

            var doc = await documents.GetAsync(id, vendorId, ct);
            return doc is null
                ? Results.Json(new ApiError("not_found", "Order not found."), statusCode: StatusCodes.Status404NotFound)
                : Results.Ok(VendorOrderDto.From(doc));
        }).RequireAuthorization("VendorRole");

        return app;
    }
}
