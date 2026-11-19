using System.Net.Http.Json;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;

namespace CatalogService.Tests;

/// <summary>
/// The listing writes as a vendor's client makes them (WI-CAT-007): an edit names the edit version it was read at in <c>If-Match</c>. Tests that are
/// not about the precondition go through these, so they keep testing what they tested; the precondition's own tests send the headers by hand.
/// </summary>
internal static class ListingWrites
{
    /// <summary><c>POST /catalog/listings</c> with an <c>Idempotency-Key</c>: <paramref name="key"/> when given, else a new one (a new listing).</summary>
    public static Task<HttpResponseMessage> CreateListingAsync(this HttpClient client, object body, string? key = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/catalog/listings") { Content = JsonContent.Create(body) };
        request.Headers.TryAddWithoutValidation(ListingEndpoints.IdempotencyKeyHeader, key ?? NewKey());
        return client.SendAsync(request);
    }

    public static string NewKey() => $"key-{Guid.NewGuid():N}";

    /// <summary>A create through the service with a new idempotency key, for tests that call the service directly and are not about the key.</summary>
    public static Task<ListingResult> CreateWithNewKeyAsync(this ListingService service, string vendorId, ListingRequest request) =>
        service.CreateAsync(vendorId, NewKey(), request);

    /// <summary>
    /// <c>PUT /catalog/listings/{id}</c> with <c>If-Match</c>: <paramref name="editVersion"/> when given, else the version the caller reads now
    /// (1 when the caller cannot read the listing, so a refusal is still the refusal the test expects: not found, forbidden).
    /// </summary>
    public static async Task<HttpResponseMessage> EditListingAsync(this HttpClient client, string id, object body, long? editVersion = null)
    {
        var version = editVersion ?? await CurrentEditVersionAsync(client, id);
        var request = new HttpRequestMessage(HttpMethod.Put, $"/catalog/listings/{id}") { Content = JsonContent.Create(body) };
        request.Headers.TryAddWithoutValidation("If-Match", EditVersionHeader.Format(version));
        return await client.SendAsync(request);
    }

    /// <summary>The edit version the caller's own view reports in its ETag, or 1 when the caller cannot read the listing.</summary>
    public static async Task<long> CurrentEditVersionAsync(this HttpClient client, string id)
    {
        using var response = await client.GetAsync($"/catalog/listings/mine/{Uri.EscapeDataString(id)}");
        return response.IsSuccessStatusCode && EditVersionHeader.Parse(response.Headers.ETag?.Tag) is { } version ? version : 1;
    }

    /// <summary>An edit through the service at the listing's current edit version, for tests that call the service directly.</summary>
    public static Task<ListingResult> EditAsync(this ListingService service, ListingDocument current, ListingRequest request) =>
        service.UpdateAsync(current, current.EditVersion, request);
}
