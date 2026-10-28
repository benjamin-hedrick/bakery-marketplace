using OrderingService.Checkout;

namespace OrderingService.Api;

/// <summary>The windows a customer can choose from, in UTC (first-slice contract D-3, D-7).</summary>
public sealed record PickupWindowsDto(IReadOnlyList<PickupWindowDto> Windows);

public static class PickupWindowEndpoints
{
    public static IEndpointRouteBuilder MapPickupWindowEndpoints(this IEndpointRouteBuilder app)
    {
        // Anonymous on purpose: the contract fetches windows next to the public listing page, which can be rendered on the server. The list is
        // the same schedule checkout validates against (D-8), so what is offered here is what checkout accepts, until the clock moves past it.
        app.MapGet("/ordering/pickup-windows", (string? vendorId, PickupSchedule schedule, TimeProvider time, HttpContext http) =>
        {
            if (string.IsNullOrWhiteSpace(vendorId) || vendorId.Length > 100)
            {
                return Results.Json(
                    new ApiError("validation_failed", "A vendor id is required.", new Dictionary<string, string[]> { ["vendorId"] = ["A vendor id is required."] }),
                    statusCode: StatusCodes.Status422UnprocessableEntity);
            }

            // The slice has one schedule for every vendor, so the vendor id does not change the answer and cannot be checked here: ordering
            // has no vendor data (open item 39 covers per-vendor hours).
            var windows = schedule.WindowsAt(time.GetUtcNow()).Select(w => new PickupWindowDto(w.Start, w.End)).ToList();

            // The list changes every slot, so it is not cached.
            http.Response.Headers.CacheControl = "no-store";
            return Results.Ok(new PickupWindowsDto(windows));
        }).AllowAnonymous();

        return app;
    }
}
