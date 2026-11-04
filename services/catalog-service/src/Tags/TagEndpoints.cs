using CatalogService.Api;

namespace CatalogService.Tags;

/// <summary>A tag as a public response shows it. Visibility, assignment and windows are the catalog's business and are not exposed.</summary>
public sealed record TagDto(string Id, string Kind, string Label, int SortOrder)
{
    public static TagDto From(TagDefinition t) => new(t.Id, t.Kind.ToString().ToLowerInvariant(), t.Label, t.SortOrder);
}

/// <summary>The public tag registry (ADR-0022): the tags a response may carry today, so a screen can offer the allergen list and name a tag.</summary>
public static class TagEndpoints
{
    /// <summary>The registry changes only with a release or at a window edge, so a short shared cache is safe (ADR-0014).</summary>
    public const string CacheControl = "public, max-age=300";

    public static IEndpointRouteBuilder MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/catalog/tags", (string? kind, ITagRegistry registry, TimeProvider time, HttpContext http) =>
        {
            TagKind? filter = null;
            if (!string.IsNullOrEmpty(kind))
            {
                if (!Enum.TryParse<TagKind>(kind, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
                {
                    return Results.Json(
                        new ApiError("validation_failed", "The request is invalid.", new Dictionary<string, string[]>
                        {
                            ["kind"] = [$"One of: {string.Join(", ", Enum.GetNames<TagKind>().Select(n => n.ToLowerInvariant()))}."],
                        }),
                        statusCode: StatusCodes.Status422UnprocessableEntity);
                }
                filter = parsed;
            }

            var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
            http.Response.Headers.CacheControl = CacheControl;
            return Results.Ok(new { items = registry.PublicOn(today, filter).Select(TagDto.From).ToList() });
        }).AllowAnonymous();

        return app;
    }
}
