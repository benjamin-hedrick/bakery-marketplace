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

    /// <summary>
    /// The public listing reads carry stock, so nothing downstream may reuse an answer without asking again (ADR-0014 layer 3, WI-PORT-004): explicit, not
    /// a framework default. They are not <c>private</c> because they are the same for everyone; the personalized reads are <c>private, no-store</c>.
    /// </summary>
    public const string PublicCacheControl = "no-cache";

    /// <summary>The header a create names its idempotency key in (WI-CAT-007 requirement 5).</summary>
    public const string IdempotencyKeyHeader = "Idempotency-Key";

    public static IEndpointRouteBuilder MapListingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/catalog/listings");

        // Public reads (first-slice contract D-4): anonymous, Published listings of Verified vendors only.
        // ?tag=a&tag=b narrows to the listings that carry ALL the tags on the listing itself (WI-TAG-003). The cache headers are the unfiltered browse's.
        group.MapGet("/", async (
            int? limit, string? after, string[]? tag, ListingService svc, TagProjector tags,
            ITagRegistry registry, TimeProvider time, TagOptions limits, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = PublicCacheControl;
            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (filter, filterErrors) = TagFilter.Parse(tag, registry, time, limits);
            if (filterErrors.Count > 0) return ToError(new ListingResult(ListingOutcome.Invalid, Errors: filterErrors));
            var (items, next) = await svc.BrowseAsync(size, after, filter.Count == 0 ? null : l => TagFilter.Matches(l, filter), ct);
            return Results.Ok(new ListingPage(items.Select(l => ListingDto.From(l, tags)).ToList(), next));
        }).AllowAnonymous();

        group.MapGet("/{id}", async (string id, ListingService svc, TagProjector tags, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = PublicCacheControl;
            var listing = await svc.GetPublicAsync(id, ct);
            return listing is null ? NotFound() : Results.Ok(ListingDto.From(listing, tags));
        }).AllowAnonymous();

        // The vendor's own listings, drafts included, with the exact quantity (register item 63). The vendor id comes from the token, and the
        // read is confined to that vendor's partition, so another vendor's listing is indistinguishable from a missing one.
        group.MapGet("/mine", async (string? status, int? limit, string? after, ClaimsPrincipal user, ListingService svc, TagProjector tags, CancellationToken ct) =>
        {
            var vendorId = user.SubjectId();
            if (vendorId is null) return Results.Unauthorized();
            if (status is not null && !ListingStatuses.IsValid(status))
                return ToError(new ListingResult(ListingOutcome.Invalid, Errors: new Dictionary<string, string[]> { ["status"] = ["Draft or Published."] }));

            var size = Math.Clamp(limit ?? DefaultPageSize, 1, MaxPageSize);
            var (items, next) = await svc.ListOwnAsync(vendorId, status, size, after, ct);
            return Results.Ok(new ListingPage(items.Select(l => ListingDto.ForOwner(l, tags)).ToList(), next));
        }).RequireAuthorization("VendorRole");

        group.MapGet("/mine/{id}", async (string id, ClaimsPrincipal user, ListingService svc, TagProjector tags, HttpContext http, CancellationToken ct) =>
        {
            var vendorId = user.SubjectId();
            if (vendorId is null) return Results.Unauthorized();
            var listing = await svc.GetOwnAsync(id, vendorId, ct);
            return listing is null ? NotFound() : Owner(http, listing, tags);
        }).RequireAuthorization("VendorRole");

        // Vendor writes: Vendor role (coarse) + resource ownership (ADR-0006). The vendor id always comes from the token.
        group.MapPost("/", async (ListingRequest request, ClaimsPrincipal user, ListingService svc, TagProjector tags, HttpContext http, CancellationToken ct) =>
        {
            var vendorId = user.SubjectId();
            if (vendorId is null) return Results.Unauthorized();

            // Idempotent (WI-CAT-007): a repeat of the same create answers 200 with the listing as it is now.
            var key = http.Request.Headers[IdempotencyKeyHeader];
            var result = await svc.CreateAsync(vendorId, key.Count == 1 ? key[0] : null, request, ct);
            if (result.Outcome == ListingOutcome.Repeated) return Owner(http, result.Listing!, tags);
            if (result.Outcome != ListingOutcome.Created) return ToError(result);
            http.Response.Headers.ETag = EditVersionHeader.Format(result.Listing!.EditVersion);
            return Results.Created($"/catalog/listings/{result.Listing.Id}", ListingDto.ForOwner(result.Listing, tags));
        }).RequireAuthorization("VendorRole");

        // An edit names the edit version its form was read at (If-Match, WI-CAT-007, register 208): without one it is refused (428), and when the
        // listing has been edited since it is refused (409 version_mismatch, with the current version) and nothing is written.
        group.MapPut("/{id}", async (
            string id, ListingRequest request, ClaimsPrincipal user,
            ListingService svc, IAuthorizationService authz, TagProjector tags, HttpContext http, CancellationToken ct) =>
        {
            var callerId = user.SubjectId();
            if (callerId is null) return Results.Unauthorized();

            var ifMatch = http.Request.Headers.IfMatch;
            if (EditVersionHeader.Parse(ifMatch.Count == 1 ? ifMatch[0] : null) is not { } expected) return PreconditionRequired();

            // Looked up in the caller's own partition: another vendor's listing is indistinguishable from a missing one.
            var existing = await svc.GetOwnAsync(id, callerId, ct);
            if (existing is null) return NotFound();

            // Defense in depth: the explicit ownership requirement still runs even though the partition already scopes it.
            var auth = await authz.AuthorizeAsync(
                user, new ListingResource(existing.Id, existing.VendorId), new ResourceOwnershipRequirement("Vendor"));
            if (!auth.Succeeded) return Results.Forbid();

            var result = await svc.UpdateAsync(existing, expected, request, ct);
            return result.Outcome == ListingOutcome.Ok ? Owner(http, result.Listing!, tags) : ToError(result);
        }).RequireAuthorization("VendorRole");

        // Increment or decrement the quantity of a limited-stock listing (ADR-0017). Same ownership rules as an edit.
        group.MapPost("/{id}/stock/adjust", async (
            string id, StockAdjustRequest request, ClaimsPrincipal user,
            ListingService svc, IAuthorizationService authz, TagProjector tags, HttpContext http, CancellationToken ct) =>
        {
            var callerId = user.SubjectId();
            if (callerId is null) return Results.Unauthorized();

            var errors = ListingValidator.ValidateAdjust(request);
            if (errors.Count > 0) return ToError(new ListingResult(ListingOutcome.Invalid, Errors: errors));

            var existing = await svc.GetOwnAsync(id, callerId, ct);
            if (existing is null) return NotFound();

            var auth = await authz.AuthorizeAsync(
                user, new ListingResource(existing.Id, existing.VendorId), new ResourceOwnershipRequirement("Vendor"));
            if (!auth.Succeeded) return Results.Forbid();

            var result = await svc.AdjustStockAsync(existing, request.Delta!.Value, ct);
            return result.Outcome == ListingOutcome.Ok ? Owner(http, result.Listing!, tags) : ToError(result);
        }).RequireAuthorization("VendorRole");

        return app;
    }

    private static IResult NotFound() =>
        Results.Json(new ApiError("not_found", "Listing not found."), statusCode: StatusCodes.Status404NotFound);

    /// <summary>One listing in its owner's view, with its edit version as the ETag an edit names in If-Match.</summary>
    private static IResult Owner(HttpContext http, ListingDocument listing, TagProjector tags)
    {
        http.Response.Headers.ETag = EditVersionHeader.Format(listing.EditVersion);
        return Results.Ok(ListingDto.ForOwner(listing, tags));
    }

    private static IResult PreconditionRequired() => Results.Json(
        new ApiError("precondition_required", "An edit needs an If-Match header with the listing's edit version. Reload the listing and try again."),
        statusCode: StatusCodes.Status428PreconditionRequired);

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
        ListingOutcome.VersionMismatch => Results.Json(
            new VersionMismatchError("version_mismatch", "The listing was edited since it was read. Reload it and try again.", r.Listing!.EditVersion),
            statusCode: StatusCodes.Status409Conflict),
        ListingOutcome.KeyReuse => Results.Json(
            new ApiError("idempotency_key_reuse", "This Idempotency-Key was already used to create a different listing. Use a new key for a new listing."),
            statusCode: StatusCodes.Status422UnprocessableEntity),
        ListingOutcome.Conflict => Results.Json(
            new ApiError("conflict", "The listing was changed by another request. Reload it and try again."),
            statusCode: StatusCodes.Status409Conflict),
        _ => Results.Json(new ApiError("internal", "Unexpected result."), statusCode: StatusCodes.Status500InternalServerError),
    };
}
