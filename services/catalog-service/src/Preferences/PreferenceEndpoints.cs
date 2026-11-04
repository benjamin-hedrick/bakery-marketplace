using System.Security.Claims;
using CatalogService.Api;
using CatalogService.Services;
using CatalogService.Tags;

namespace CatalogService.Preferences;

/// <summary>The profile as returned. <c>updatedAt</c> is null for a customer who never saved one.</summary>
public sealed record PreferencesDto(IReadOnlyList<string> Allergies, IReadOnlyList<string> Avoid, DateTimeOffset? UpdatedAt, IReadOnlyList<string> Prefer)
{
    public static PreferencesDto From(PreferenceProfile p) => new(p.Allergies, p.Avoid, p.UpdatedAt, p.Prefer);
}

/// <summary>One cart line to check: a listing and the options the customer chose on it.</summary>
public sealed record CartLineRequest(string? ListingId, List<string?>? OptionIds);

public sealed record CartCheckRequest(List<CartLineRequest?>? Lines);

/// <summary>
/// The check of one cart line, in the order sent. A listing that is not public is <c>found: false</c> (reported for that line, not a failure of the
/// check); option ids the listing does not have are named in <c>unknownOptionIds</c> and count for nothing.
/// </summary>
public sealed record CartLineCheckDto(
    string ListingId, bool Found, IReadOnlyList<string> UnknownOptionIds, IReadOnlyList<Conflict> Conflicts, IReadOnlyList<DietMatch> DietMatches);

/// <summary>
/// The customer's own allergen profile (WI-PREF-001) and the check of a cart against it (WI-SRCH-001). Customer role only, and the customer is
/// always the token's subject: there is no customer id in a path, a query or a body, so another customer's profile cannot be named. Responses are
/// <c>private, no-store</c>, and nothing of the profile is written to a log or a span (bodies are never logged; ids appear in no message).
/// </summary>
public static class PreferenceEndpoints
{
    /// <summary>A profile holds at most two short lists of ids; anything larger is refused before it is parsed.</summary>
    public const int MaxBodyBytes = 4096;

    public const int MaxCartLines = 50;
    public const int MaxOptionsPerLine = 20;
    public const int MaxIdLength = 100;

    /// <summary>A cart check is at most 50 lines of up to 20 options each; this is the room for that and no more.</summary>
    public const int MaxCartBodyBytes = 64 * 1024;

    public static IEndpointRouteBuilder MapPreferenceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/catalog/preferences").RequireAuthorization("CustomerRole");

        group.MapGet("/", async (ClaimsPrincipal user, HttpContext http, PreferenceService service, CancellationToken ct) =>
        {
            var customerId = SubjectOf(user);
            if (customerId is null) return Results.Unauthorized();

            http.Response.Headers.CacheControl = "private, no-store";
            return Results.Ok(PreferencesDto.From(await service.GetAsync(customerId, ct)));
        });

        group.MapPut("/", async (ClaimsPrincipal user, HttpContext http, PreferenceService service, CancellationToken ct) =>
        {
            var customerId = SubjectOf(user);
            if (customerId is null) return Results.Unauthorized();

            http.Response.Headers.CacheControl = "private, no-store";
            var (request, problem) = await BodyReader.ReadJsonAsync<PreferencesRequest>(http, MaxBodyBytes, "JSON with allergies and avoid lists", ct);
            if (problem is not null) return problem;

            var result = await service.ReplaceAsync(customerId, request, ct);
            return result.Outcome == PreferenceOutcome.Saved
                ? Results.Ok(PreferencesDto.From(result.Profile!))
                : Results.Json(new ApiError("validation_failed", "The preferences are invalid.", result.Errors), statusCode: StatusCodes.Status422UnprocessableEntity);
        });

        // The cart check: each line's listing and the options chosen on it against the caller's profile. Only the chosen options count, which
        // is why this is not the browse view (that one shows what a listing can contain).
        group.MapPost("/check", async (
            ClaimsPrincipal user, HttpContext http, IPreferenceReader reader, ListingService listings,
            ITagRegistry registry, TimeProvider time, CancellationToken ct) =>
        {
            var customerId = SubjectOf(user);
            if (customerId is null) return Results.Unauthorized();

            http.Response.Headers.CacheControl = "private, no-store";
            var (request, problem) = await BodyReader.ReadJsonAsync<CartCheckRequest>(http, MaxCartBodyBytes, "JSON with a list of cart lines", ct);
            if (problem is not null) return problem;

            var errors = ValidateCart(request!);
            if (errors.Count > 0)
                return Results.Json(new ApiError("validation_failed", "The cart is invalid.", errors), statusCode: StatusCodes.Status422UnprocessableEntity);

            var profile = await reader.GetAsync(customerId, ct);
            var found = new Dictionary<string, Domain.ListingDocument?>(StringComparer.Ordinal);
            var checks = new List<CartLineCheckDto>();
            foreach (var line in request!.Lines!)
            {
                var id = line!.ListingId!;
                if (!found.TryGetValue(id, out var listing)) found[id] = listing = await listings.GetPublicAsync(id, ct);
                if (listing is null)
                {
                    checks.Add(new CartLineCheckDto(id, false, [], [], []));
                    continue;
                }

                var chosen = (line.OptionIds ?? []).Select(o => o!).Distinct(StringComparer.Ordinal).ToList();
                var known = listing.Modifiers.Select(m => m.Id).ToHashSet(StringComparer.Ordinal);
                checks.Add(new CartLineCheckDto(
                    id, true, chosen.Where(o => !known.Contains(o)).ToList(), ConflictMatcher.For(listing, profile, chosen),
                    DietMatcher.For(listing, profile, registry, DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime), chosen)));
            }
            return Results.Ok(new { lines = checks });
        });

        return app;
    }

    private static Dictionary<string, string[]> ValidateCart(CartCheckRequest request)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = new List<string>();
            list.Add(message);
        }

        if (request.Lines is null) Add("lines", "Required.");
        else if (request.Lines.Count > MaxCartLines) Add("lines", $"At most {MaxCartLines} lines.");
        else
        {
            for (var i = 0; i < request.Lines.Count; i++)
            {
                var line = request.Lines[i];
                var key = $"lines[{i}]";
                if (line is null) { Add(key, "Required."); continue; }
                if (string.IsNullOrWhiteSpace(line.ListingId) || line.ListingId.Length > MaxIdLength) Add($"{key}.listingId", "A listing id is required.");
                if (line.OptionIds is { Count: > MaxOptionsPerLine }) Add($"{key}.optionIds", $"At most {MaxOptionsPerLine} options.");
                else if (line.OptionIds?.Any(o => string.IsNullOrWhiteSpace(o) || o.Length > MaxIdLength) == true)
                    Add($"{key}.optionIds", "Option ids must not be empty.");
            }
        }
        return errors.ToDictionary(e => e.Key, e => e.Value.ToArray());
    }

    private static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
