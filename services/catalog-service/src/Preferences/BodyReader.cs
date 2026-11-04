using System.Text.Json;
using CatalogService.Api;

namespace CatalogService.Preferences;

/// <summary>
/// Reads a small JSON body with a hard limit, whatever length the client declares: a body that is too long (413) or is not the expected JSON (422)
/// is refused without being echoed. The framework would bind a body of any size first, which is not wanted for requests that carry a customer's
/// allergens.
/// </summary>
internal static class BodyReader
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    public static async Task<(T? Value, IResult? Problem)> ReadJsonAsync<T>(HttpContext http, int maxBytes, string expected, CancellationToken ct) where T : class
    {
        if (http.Request.ContentLength > maxBytes) return (null, TooLarge());

        using var buffer = new MemoryStream();
        var chunk = new byte[1024];
        int read;
        while ((read = await http.Request.Body.ReadAsync(chunk, ct)) > 0)
        {
            buffer.Write(chunk, 0, read);
            if (buffer.Length > maxBytes) return (null, TooLarge());
        }

        try
        {
            var value = JsonSerializer.Deserialize<T>(buffer.ToArray(), Options);
            return value is null ? (null, BadBody(expected)) : (value, null);
        }
        catch (JsonException)
        {
            return (null, BadBody(expected));
        }
    }

    private static IResult TooLarge() =>
        Results.Json(new ApiError("payload_too_large", "The request is too large."), statusCode: StatusCodes.Status413PayloadTooLarge);

    private static IResult BadBody(string expected) =>
        Results.Json(new ApiError("validation_failed", $"The request body must be {expected}."), statusCode: StatusCodes.Status422UnprocessableEntity);
}
