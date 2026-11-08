using System.Security.Claims;
using CatalogService.Api;
using CatalogService.Services;
using CatalogService.Tags;

namespace CatalogService.Preferences;

/// <summary>A public listing together with what in it conflicts with the calling customer's profile. No conflicts is an empty list, never "safe".</summary>
public sealed record PersonalizedListingDto(ListingDto Listing, IReadOnlyList<Conflict> Conflicts, IReadOnlyList<DietMatch> DietMatches);

public sealed record PersonalizedListingPage(IReadOnlyList<PersonalizedListingDto> Items, string? NextCursor);

/// <summary>
/// The browse and the detail view for a logged-in customer (WI-SRCH-001): the same listings, in the same order and with the same paging as the
/// public endpoints, each with its conflicts. They are separate from the public endpoints on purpose: those stay anonymous and cacheable
/// (ADR-0014), and these depend on who is asking, so every response is <c>private, no-store</c>. The profile is read in process (ADR-0009) and
/// is never written to a log or a span.
/// </summary>
public static class PersonalizedListingEndpoints
{
    public static IEndpointRouteBuilder MapPersonalizedListingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/catalog/listings/for-me").RequireAuthorization("CustomerRole");

        // hideConflicts leaves out listings whose ITEM contains an allergen of the profile (allergy or avoid). A listing that conflicts only
        // through an optional add-on stays, marked: hiding a whole product for an optional extra would remove too much. The hiding happens
        // before paging, so a page is still full and the cursor is still "after this id".
        group.MapGet("/", async (
            int? limit, string? after, bool? hideConflicts, ClaimsPrincipal user, HttpContext http,
            ListingService listings, IPreferenceReader reader, TagProjector tags, ITagRegistry registry, TimeProvider time, CancellationToken ct) =>
        {
            var customerId = SubjectOf(user);
            if (customerId is null) return Results.Unauthorized();

            http.Response.Headers.CacheControl = "private, no-store";
            var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
            var profile = await reader.GetAsync(customerId, ct);
            var size = Math.Clamp(limit ?? ListingEndpoints.DefaultPageSize, 1, ListingEndpoints.MaxPageSize);
            Func<Domain.ListingDocument, bool>? include = hideConflicts == true ? l => !ConflictMatcher.ItemConflicts(l, profile) : null;

            var (items, next) = await listings.BrowseAsync(size, after, include, ct);
            return Results.Ok(new PersonalizedListingPage(
                items.Select(l => new PersonalizedListingDto(ListingDto.From(l, tags), ConflictMatcher.For(l, profile), DietMatcher.For(l, profile, registry, today))).ToList(), next));
        });

        group.MapGet("/{id}", async (
            string id, ClaimsPrincipal user, HttpContext http, ListingService listings, IPreferenceReader reader, TagProjector tags,
            ITagRegistry registry, TimeProvider time, CancellationToken ct) =>
        {
            var customerId = SubjectOf(user);
            if (customerId is null) return Results.Unauthorized();

            http.Response.Headers.CacheControl = "private, no-store";
            var listing = await listings.GetPublicAsync(id, ct);
            if (listing is null)
                return Results.Json(new ApiError("not_found", "Listing not found."), statusCode: StatusCodes.Status404NotFound);

            var profile = await reader.GetAsync(customerId, ct);
            return Results.Ok(new PersonalizedListingDto(
                ListingDto.From(listing, tags), ConflictMatcher.For(listing, profile),
                DietMatcher.For(listing, profile, registry, DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime))));
        });

        return app;
    }

    private static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
