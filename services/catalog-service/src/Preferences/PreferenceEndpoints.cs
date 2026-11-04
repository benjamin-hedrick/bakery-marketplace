using System.Security.Claims;
using System.Text.Json;
using CatalogService.Api;

namespace CatalogService.Preferences;

/// <summary>The profile as returned. <c>updatedAt</c> is null for a customer who never saved one.</summary>
public sealed record PreferencesDto(IReadOnlyList<string> Allergies, IReadOnlyList<string> Avoid, DateTimeOffset? UpdatedAt)
{
    public static PreferencesDto From(PreferenceProfile p) => new(p.Allergies, p.Avoid, p.UpdatedAt);
}

/// <summary>
/// The customer's own allergen profile (WI-PREF-001). Customer role only, and the customer is always the token's subject: there is no customer id
/// in the path or the body, so another customer's profile cannot be named. Responses are <c>private, no-store</c>, and nothing of the profile
/// is written to a log or a span (the body is never logged; ids appear in no message).
/// </summary>
public static class PreferenceEndpoints
{
    /// <summary>A profile holds at most two short lists of ids; anything larger is refused before it is parsed.</summary>
    public const int MaxBodyBytes = 4096;

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
            var (request, problem) = await ReadBodyAsync(http, ct);
            if (problem is not null) return problem;

            var result = await service.ReplaceAsync(customerId, request, ct);
            return result.Outcome == PreferenceOutcome.Saved
                ? Results.Ok(PreferencesDto.From(result.Profile!))
                : Results.Json(new ApiError("validation_failed", "The preferences are invalid.", result.Errors), statusCode: StatusCodes.Status422UnprocessableEntity);
        });

        return app;
    }

    /// <summary>
    /// Reads at most <see cref="MaxBodyBytes"/> bytes of JSON, whatever the client declares: a body that is too long, or is not the expected JSON,
    /// is refused without being echoed.
    /// </summary>
    private static async Task<(PreferencesRequest? Request, IResult? Problem)> ReadBodyAsync(HttpContext http, CancellationToken ct)
    {
        if (http.Request.ContentLength > MaxBodyBytes) return (null, TooLarge());

        using var buffer = new MemoryStream();
        var chunk = new byte[1024];
        int read;
        while ((read = await http.Request.Body.ReadAsync(chunk, ct)) > 0)
        {
            buffer.Write(chunk, 0, read);
            if (buffer.Length > MaxBodyBytes) return (null, TooLarge());
        }

        try
        {
            var request = JsonSerializer.Deserialize<PreferencesRequest>(buffer.ToArray(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return request is null ? (null, BadBody()) : (request, null);
        }
        catch (JsonException)
        {
            return (null, BadBody());
        }
    }

    private static IResult TooLarge() =>
        Results.Json(new ApiError("payload_too_large", "The request is too large."), statusCode: StatusCodes.Status413PayloadTooLarge);

    private static IResult BadBody() =>
        Results.Json(new ApiError("validation_failed", "The request body must be JSON with allergies and avoid lists."), statusCode: StatusCodes.Status422UnprocessableEntity);

    private static string? SubjectOf(ClaimsPrincipal user) =>
        user.FindFirst("sub")?.Value ?? user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
