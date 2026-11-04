using System.Security.Claims;
using BakeryMarketplace.EventSchemas;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Persistence;

namespace OrderingService.Api;

/// <summary>Stable, client-safe error body: a machine-readable code, a message, and optional per-field or per-line detail.</summary>
public sealed record ApiError(string Code, string Message, IReadOnlyDictionary<string, string[]>? Errors = null, IReadOnlyList<StockLineRejection>? Lines = null, string? CurrentStatus = null);

public sealed record OrderLineDto(string ListingId, IReadOnlyList<string> Modifiers, int Quantity, int UnitPriceCents, long PriceCents);

public sealed record PickupWindowDto(DateTimeOffset Start, DateTimeOffset End);

/// <summary>The order as returned to its customer (first-slice contract section 4). Money is integer cents, USD; instants are UTC.</summary>
public sealed record OrderDto(
    string Id,
    string CustomerId,
    string VendorId,
    IReadOnlyList<OrderLineDto> LineItems,
    long TotalCents,
    string Currency,
    string Status,
    string FulfillmentType,
    PickupWindowDto? PickupWindow,
    long SequenceNumber,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    IReadOnlyList<string> Allergens)
{
    public static OrderDto From(Order o) => new(
        o.Id, o.CustomerId, o.VendorId,
        o.Lines.Select(l => new OrderLineDto(l.ListingId, l.ModifierIds, l.Quantity, l.UnitPriceCents, l.LineCents)).ToList(),
        o.TotalCents, o.Currency, o.Status.ToString(), o.FulfillmentType.ToString(),
        o.Fulfillment?.Pickup is { } p ? new PickupWindowDto(p.WindowStart, p.WindowEnd) : null,
        o.SequenceNumber, o.CreatedAt, o.UpdatedAt, o.Allergens);
}

/// <summary>One page of the customer's orders, and the cursor of the next page (null on the last).</summary>
public sealed record OrderPage(IReadOnlyList<OrderDto> Items, string? NextCursor);

public static class CheckoutEndpoints
{
    public const string IdempotencyKeyHeader = "Idempotency-Key";

    /// <summary>Test hook (first-slice contract D-10): <c>X-Test-Payment: decline</c> makes the payment stub decline. Ignored in Production.</summary>
    public const string TestPaymentHeader = "X-Test-Payment";

    public static IEndpointRouteBuilder MapCheckoutEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/ordering").RequireAuthorization("CustomerRole");

        group.MapPost("/checkout", async (
            CheckoutRequest? request, HttpContext http, CheckoutService checkout, IHostEnvironment env, ILogger<CheckoutService> log, CancellationToken ct) =>
        {
            var customerId = SubjectOf(http.User);
            if (customerId is null) return Results.Unauthorized();

            var forceDecline = false;
            if (string.Equals(http.Request.Headers[TestPaymentHeader], "decline", StringComparison.OrdinalIgnoreCase))
            {
                if (env.IsProduction()) log.LogWarning("The {Header} header was sent in Production and was ignored", TestPaymentHeader);
                else forceDecline = true;
            }

            var result = await checkout.CheckoutAsync(customerId, http.Request.Headers[IdempotencyKeyHeader].FirstOrDefault(), request, forceDecline, ct);
            return result.Outcome switch
            {
                CheckoutOutcome.Created => Results.Created($"/ordering/orders/{result.Order!.Order.Id}", OrderDto.From(result.Order.Order)),
                CheckoutOutcome.Existing => Results.Ok(OrderDto.From(result.Order!.Order)),
                CheckoutOutcome.Invalid or CheckoutOutcome.KeyReuse => Error(StatusCodes.Status422UnprocessableEntity, result),
                CheckoutOutcome.Conflict => Error(StatusCodes.Status409Conflict, result),
                CheckoutOutcome.PaymentDeclined => Error(StatusCodes.Status402PaymentRequired, result),
                _ => Error(StatusCodes.Status503ServiceUnavailable, result),
            };
        });

        // The customer's own order. Another customer's order, and one that does not exist, look the same (404, never 403).
        group.MapGet("/orders/{id}", async (string id, HttpContext http, OrderStore orders, CancellationToken ct) =>
        {
            var customerId = SubjectOf(http.User);
            if (customerId is null) return Results.Unauthorized();

            var stored = await orders.GetAsync(id, customerId, ct);
            return stored is null
                ? Results.Json(new ApiError("not_found", "Order not found."), statusCode: StatusCodes.Status404NotFound)
                : Results.Ok(OrderDto.From(stored.Order));
        });

        // The customer's own orders, newest first, one page after the cursor (WI-CUST-007). The customer is always the token's subject.
        group.MapGet("/orders", async (int? limit, string? after, HttpContext http, OrderStore orders, CancellationToken ct) =>
        {
            var customerId = SubjectOf(http.User);
            if (customerId is null) return Results.Unauthorized();

            if (!OrderStore.IsValidCursor(after))
            {
                return Results.Json(
                    new ApiError("validation_failed", "The request is invalid.", new Dictionary<string, string[]> { ["after"] = ["Not a cursor from a previous page."] }),
                    statusCode: StatusCodes.Status422UnprocessableEntity);
            }

            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await orders.ListForCustomerAsync(customerId, size, after, ct);
            return Results.Ok(new OrderPage(items.Select(OrderDto.From).ToList(), next));
        });

        return app;
    }

    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    internal static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private static IResult Error(int status, CheckoutResult r)
    {
        var errors = r.Problems?
            .GroupBy(p => p.Field)
            .ToDictionary(g => g.Key, g => g.Select(p => p.Message).ToArray());
        return Results.Json(new ApiError(r.Code ?? "error", r.Message ?? "The request could not be completed.", errors, r.StockRejections), statusCode: status);
    }
}
