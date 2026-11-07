using OrderingService.Orders;

namespace OrderingService.Api;

/// <summary>
/// Order actions (WI-ORD-007, <c>docs/architecture/order-lifecycle.md</c>). The vendor moves their own order forward or declines it; a customer
/// or the vendor cancels. Role comes from the token's <c>roles</c> claim and ownership from comparing the token subject with the order's
/// vendor or customer: a caller who does not own the order gets <c>404</c> exactly as if it did not exist (ADR-0006, ADR-0008). The
/// actor and reason of a cancellation are derived here, never read from the request.
/// </summary>
public static class OrderActionEndpoints
{
    public static IEndpointRouteBuilder MapOrderActionEndpoints(this IEndpointRouteBuilder app)
    {
        var vendor = app.MapGroup("/ordering/orders/{id}").RequireAuthorization("VendorRole");
        vendor.MapPost("/confirm", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.Confirm, http, actions, ct));
        vendor.MapPost("/decline", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.Decline, http, actions, ct));
        vendor.MapPost("/start-preparation", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.StartPreparation, http, actions, ct));
        vendor.MapPost("/ready", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.MarkReady, http, actions, ct));
        vendor.MapPost("/complete", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.Complete, http, actions, ct));

        // Either side may cancel; which one is acting is decided by who owns the order.
        app.MapPost("/ordering/orders/{id}/cancel", (string id, HttpContext http, OrderActionService actions, CancellationToken ct) => Act(id, OrderAction.Cancel, http, actions, ct))
            .RequireAuthorization(policy => policy.RequireAssertion(context =>
                context.User.HasClaim("roles", "Customer") || context.User.HasClaim("roles", "Vendor")));

        return app;
    }

    private static async Task<IResult> Act(string id, OrderAction action, HttpContext http, OrderActionService actions, CancellationToken ct)
    {
        var subject = CheckoutEndpoints.SubjectOf(http.User);
        if (subject is null) return Results.Unauthorized();

        var caller = new OrderCaller(subject, http.User.HasClaim("roles", "Vendor"), http.User.HasClaim("roles", "Customer"));
        var result = await actions.ActAsync(id, caller, action, ct);
        return result.Outcome switch
        {
            OrderActionOutcome.Done => Results.Ok(OrderDto.From(result.Order!.Order)),
            // Handed over: a strategy completes the order moments later; the body is the order as it is now (WI-ORD-003).
            OrderActionOutcome.Accepted => Results.Json(OrderDto.From(result.Order!.Order), statusCode: StatusCodes.Status202Accepted),
            OrderActionOutcome.NotFound => Results.Json(new ApiError("not_found", "Order not found."), statusCode: StatusCodes.Status404NotFound),
            _ => Results.Json(
                new ApiError(result.Code ?? "conflict", result.Message ?? "The action cannot be done now.", CurrentStatus: result.CurrentStatus?.ToString()),
                statusCode: StatusCodes.Status409Conflict),
        };
    }
}
