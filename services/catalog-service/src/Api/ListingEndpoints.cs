using System.Security.Claims;
using BakeryMarketplace.Auth;
using CatalogService.Domain;
using CatalogService.Services;
using CatalogService.Tags;
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
        group.MapGet("/", async (int? limit, string? after, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await svc.BrowseAsync(size, after, ct);
            return Results.Ok(new ListingPage(items.Select(l => ListingDto.From(l, tags)).ToList(), next));
        }).AllowAnonymous();

        group.MapGet("/{id}", async (string id, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var listing = await svc.GetPublicAsync(id, ct);
            return listing is null ? NotFound() : Results.Ok(ListingDto.From(listing, tags));
        }).AllowAnonymous();

        // The vendor's own listings, drafts included, with the exact quantity (register item 63). The vendor id comes from the token, and the
        // read is confined to that vendor's partition, so another vendor's listing is indistinguishable from a missing one.
        group.MapGet("/mine", async (string? status, int? limit, string? after, ClaimsPrincipal user, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var vendorId = SubjectOf(user);
            if (vendorId is null) return Results.Unauthorized();
            if (status is not null && !ListingStatuses.IsValid(status))
                return ToError(new ListingResult(ListingOutcome.Invalid, Errors: new Dictionary<string, string[]> { ["status"] = ["Draft or Published."] }));

            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await svc.ListOwnAsync(vendorId, status, size, after, ct);
            return Results.Ok(new ListingPage(items.Select(l => ListingDto.ForOwner(l, tags)).ToList(), next));
        }).RequireAuthorization("VendorRole");

        group.MapGet("/mine/{id}", async (string id, ClaimsPrincipal user, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var vendorId = SubjectOf(user);
            if (vendorId is null) return Results.Unauthorized();
            var listing = await svc.GetOwnAsync(id, vendorId, ct);
            return listing is null ? NotFound() : Results.Ok(ListingDto.ForOwner(listing, tags));
        }).RequireAuthorization("VendorRole");

        // Vendor writes: Vendor role (coarse) + resource ownership (ADR-0006). The vendor id always comes from the token.
        group.MapPost("/", async (ListingRequest request, ClaimsPrincipal user, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var vendorId = SubjectOf(user);
            if (vendorId is null) return Results.Unauthorized();

            var result = await svc.CreateAsync(vendorId, request, ct);
            return result.Outcome switch
            {
                ListingOutcome.Created => Results.Created($"/catalog/listings/{result.Listing!.Id}", ListingDto.ForOwner(result.Listing, tags)),
                _ => ToError(result),
            };
        }).RequireAuthorization("VendorRole");

        group.MapPut("/{id}", async (
            string id, ListingRequest request, ClaimsPrincipal user,
            ListingService svc, IAuthorizationService authz, TagProjector tags, CancellationToken ct) =>
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
            return result.Outcome == ListingOutcome.Ok ? Results.Ok(ListingDto.ForOwner(result.Listing!, tags)) : ToError(result);
        }).RequireAuthorization("VendorRole");

        // Increment or decrement the quantity of a limited-stock listing (ADR-0017). Same ownership rules as an edit.
        group.MapPost("/{id}/stock/adjust", async (
            string id, StockAdjustRequest request, ClaimsPrincipal user,
            ListingService svc, IAuthorizationService authz, TagProjector tags, CancellationToken ct) =>
        {
            var callerId = SubjectOf(user);
            if (callerId is null) return Results.Unauthorized();

            var errors = ListingValidator.ValidateAdjust(request);
            if (errors.Count > 0) return ToError(new ListingResult(ListingOutcome.Invalid, Errors: errors));

            var existing = await svc.GetOwnAsync(id, callerId, ct);
            if (existing is null) return NotFound();

            var auth = await authz.AuthorizeAsync(
                user, new ListingResource(existing.Id, existing.VendorId), new ResourceOwnershipRequirement("Vendor"));
            if (!auth.Succeeded) return Results.Forbid();

            var result = await svc.AdjustStockAsync(existing, request.Delta!.Value, ct);
            return result.Outcome == ListingOutcome.Ok ? Results.Ok(ListingDto.ForOwner(result.Listing!, tags)) : ToError(result);
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
        ListingOutcome.NotFound => NotFound(),
        ListingOutcome.MadeToOrder => Results.Json(
            new ApiError("made_to_order", "This listing is made to order and has no quantity to adjust. Set a quantity first."),
            statusCode: StatusCodes.Status409Conflict),
        ListingOutcome.InsufficientStock => Results.Json(
            new ApiError("insufficient_stock", "The quantity cannot go below zero."), statusCode: StatusCodes.Status409Conflict),
        ListingOutcome.Conflict => Results.Json(
            new ApiError("conflict", "The listing was changed by another request. Reload it and try again."),
            statusCode: StatusCodes.Status409Conflict),
        _ => Results.Json(new ApiError("internal", "Unexpected result."), statusCode: StatusCodes.Status500InternalServerError),
    };
}
