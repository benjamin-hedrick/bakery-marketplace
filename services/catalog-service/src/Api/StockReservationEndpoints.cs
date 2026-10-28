using System.Text.RegularExpressions;
using BakeryMarketplace.Auth;
using CatalogService.Domain;
using CatalogService.Services;

namespace CatalogService.Api;

// Service-to-service contract (ADR-0017, ADR-0018). Not part of the public API surface: do not route these through API Management.
public sealed record ReserveLineRequest(string? ListingId, int? Quantity);

public sealed record ReserveRequest(string? OrderId, string? VendorId, List<ReserveLineRequest>? Lines);

public sealed record ReservationLineDto(string ListingId, int Quantity, bool LimitedStock);

public sealed record ReservationDto(string OrderId, string VendorId, string State, IReadOnlyList<ReservationLineDto> Lines)
{
    public static ReservationDto From(StockReservationDocument d) => new(
        d.OrderId, d.VendorId, d.State, d.Lines.Select(l => new ReservationLineDto(l.ListingId, l.Quantity, l.Limited)).ToList());
}

public sealed record LineRejectionDto(string ListingId, string Reason, int? Available);

public sealed record ReservationRejectedBody(string Code, string Message, IReadOnlyList<LineRejectionDto> Lines);

public static partial class ReservationValidator
{
    public const int MaxLines = 50;

    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$")]
    private static partial Regex OrderIdPattern();

    public static Dictionary<string, string[]> Validate(ReserveRequest? request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request is null) return new() { ["body"] = ["A body is required."] };

        ValidateIds(request.OrderId, request.VendorId, errors);

        if (request.Lines is null || request.Lines.Count == 0) errors["lines"] = ["At least one line is required."];
        else if (request.Lines.Count > MaxLines) errors["lines"] = [$"At most {MaxLines} lines."];
        else
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                if (line is null || string.IsNullOrWhiteSpace(line.ListingId) || line.ListingId.Length > 100)
                    errors[$"lines[{i}].listingId"] = ["A listing id is required (max 100 characters)."];
                if (line?.Quantity is null or < 1 or > StockPolicy.MaxQuantity)
                    errors[$"lines[{i}].quantity"] = [$"Quantity must be between 1 and {StockPolicy.MaxQuantity}."];
            }
        }
        return errors;
    }

    public static Dictionary<string, string[]> ValidateRelease(string? orderId, string? vendorId)
    {
        var errors = new Dictionary<string, string[]>();
        ValidateIds(orderId, vendorId, errors);
        return errors;
    }

    private static void ValidateIds(string? orderId, string? vendorId, Dictionary<string, string[]> errors)
    {
        if (orderId is null || !OrderIdPattern().IsMatch(orderId))
            errors["orderId"] = ["An order id of letters, digits and . _ : - is required (max 100 characters)."];
        if (string.IsNullOrWhiteSpace(vendorId) || vendorId.Length > 100)
            errors["vendorId"] = ["A vendor id is required (max 100 characters)."];
    }
}

public static class StockReservationEndpoints
{
    public static IEndpointRouteBuilder MapStockReservationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/catalog/stock/reservations").RequireAuthorization(ServicePolicies.StockReserve);

        group.MapPost("/", async (
            ReserveRequest request, HttpContext http, StockReservationService svc, ILogger<StockReservationService> log, CancellationToken ct) =>
        {
            var errors = ReservationValidator.Validate(request);
            if (errors.Count > 0) return Invalid(errors);

            var result = await svc.ReserveAsync(
                request.OrderId!, request.VendorId!, request.Lines!.Select(l => (l.ListingId!, l.Quantity!.Value)), ct);
            log.LogInformation("Stock reserve for order {OrderId} by {Client}: {Outcome}",
                request.OrderId, ServiceCaller.ClientId(http.User), result.Outcome);

            return result.Outcome switch
            {
                ReservationOutcome.Reserved => Results.Created(
                    $"/catalog/stock/reservations/{request.OrderId}?vendorId={Uri.EscapeDataString(request.VendorId!)}",
                    ReservationDto.From(result.Reservation!)),
                ReservationOutcome.AlreadyReserved => Results.Ok(ReservationDto.From(result.Reservation!)),
                ReservationOutcome.Rejected => Results.Json(new ReservationRejectedBody(
                    "reservation_rejected", "At least one line cannot be reserved. Nothing was changed.",
                    result.Rejections!.Select(r => new LineRejectionDto(r.ListingId, r.Reason, r.Available)).ToList()),
                    statusCode: StatusCodes.Status409Conflict),
                ReservationOutcome.DifferentLines => Conflict("reservation_exists", "This order already has a reservation with different lines."),
                ReservationOutcome.ReservationReleased => Conflict("reservation_released", "This order's reservation was released and cannot be reused."),
                _ => Conflict("conflict", "The stock changed while reserving. Try again."),
            };
        });

        // The vendor id is required because a reservation lives in the vendor's partition (an order id alone does not say which).
        group.MapDelete("/{orderId}", async (
            string orderId, string? vendorId, HttpContext http, StockReservationService svc, ILogger<StockReservationService> log, CancellationToken ct) =>
        {
            var errors = ReservationValidator.ValidateRelease(orderId, vendorId);
            if (errors.Count > 0) return Invalid(errors);

            var result = await svc.ReleaseAsync(orderId, vendorId!, ct);
            log.LogInformation("Stock release for order {OrderId} by {Client}: {Outcome}",
                orderId, ServiceCaller.ClientId(http.User), result.Outcome);

            return result.Outcome switch
            {
                ReservationOutcome.Released or ReservationOutcome.AlreadyReleased => Results.Ok(ReservationDto.From(result.Reservation!)),
                ReservationOutcome.NotFound => Results.Json(
                    new ApiError("not_found", "No reservation for that order."), statusCode: StatusCodes.Status404NotFound),
                _ => Conflict("conflict", "The stock changed while releasing. Try again."),
            };
        });

        return app;
    }

    private static IResult Invalid(Dictionary<string, string[]> errors) => Results.Json(
        new ApiError("validation_failed", "The request is invalid.", errors), statusCode: StatusCodes.Status422UnprocessableEntity);

    private static IResult Conflict(string code, string message) =>
        Results.Json(new ApiError(code, message), statusCode: StatusCodes.Status409Conflict);
}
