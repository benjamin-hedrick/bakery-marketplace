using System.Security.Claims;
using BakeryMarketplace.Auth;
using CatalogService.Services;
using Microsoft.AspNetCore.Authorization;

namespace CatalogService.Api;

public static class ListingEndpoints
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapListingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/catalog/listings");

        // Public reads (first-slice contract D-4): anonymous, Published listings of Verified vendors only.
        group.MapGet("/", async (int? limit, string? after, ListingService svc, CancellationToken ct) =>
        {
            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await svc.BrowseAsync(size, after, ct);
            return Results.Ok(new ListingPage(items.Select(ListingDto.From).ToList(), next));
        }).AllowAnonymous();

        group.MapGet("/{id}", async (string id, ListingService svc, CancellationToken ct) =>
        {
            var listing = await svc.GetPublicAsync(id, ct);
            return listing is null ? NotFound() : Results.Ok(ListingDto.From(listing));
        }).AllowAnonymous();

        // Vendor writes: Vendor role (coarse) + resource ownership (ADR-0006). The vendor id always comes from the token.
        group.MapPost("/", async (ListingRequest request, ClaimsPrincipal user, ListingService svc, CancellationToken ct) =>
        {
            var vendorId = SubjectOf(user);
            if (vendorId is null) return Results.Unauthorized();

            var result = await svc.CreateAsync(vendorId, request, ct);
            return result.Outcome switch
            {
                ListingOutcome.Created => Results.Created($"/catalog/listings/{result.Listing!.Id}", ListingDto.From(result.Listing)),
                _ => ToError(result),
            };
        }).RequireAuthorization("VendorRole");

        group.MapPut("/{id}", async (
            string id, ListingRequest request, ClaimsPrincipal user,
            ListingService svc, IAuthorizationService authz, CancellationToken ct) =>
        {
            var callerId = SubjectOf(user);
            if (callerId is null) return Results.Unauthorized();

            // Looked up in the caller's own partition: another vendor's listing is indistinguishable from a missing one.
            var existing = await svc.GetOwnAsync(id, callerId, ct);
            if (existing is null) return NotFound();

            // Defense in depth: the explicit ownership requirement still runs even though the partition already scopes it.
            var auth = await authz.AuthorizeAsync(
                user, new ListingResource(existing.Id, existing.VendorId), new ResourceOwnershipRequirement("Vendor"));
            if (!auth.Succeeded) return Results.Forbid();

            var result = await svc.UpdateAsync(existing, request, ct);
            return result.Outcome == ListingOutcome.Ok ? Results.Ok(ListingDto.From(result.Listing!)) : ToError(result);
        }).RequireAuthorization("VendorRole");

        return app;
    }

    private static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    private static IResult NotFound() =>
        Results.Json(new ApiError("not_found", "Listing not found."), statusCode: StatusCodes.Status404NotFound);

    private static IResult ToError(ListingResult r) => r.Outcome switch
    {
        ListingOutcome.Invalid => Results.Json(
            new ApiError("validation_failed", "The listing is invalid.", r.Errors), statusCode: StatusCodes.Status422UnprocessableEntity),
        ListingOutcome.VendorNotVerified => Results.Json(
            new ApiError("vendor_not_verified", "Only verified vendors can publish listings."), statusCode: StatusCodes.Status409Conflict),
        _ => Results.Json(new ApiError("internal", "Unexpected result."), statusCode: StatusCodes.Status500InternalServerError),
    };
}
