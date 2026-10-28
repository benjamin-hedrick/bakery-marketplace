using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>
/// A real HTTP server standing in for catalog-service and the token endpoint, so the actual <see cref="CatalogGateway"/> and the service-token
/// handler are exercised end to end. It speaks the catalog's real shapes (public listing read, reservation and release endpoints) and records
/// every request, including whether it carried a bearer token.
/// </summary>
internal sealed class FakeCatalogServer : IAsyncDisposable
{
    public const string ClientId = "ordering-service";
    public const string ServiceToken = "service-token-for-tests";

    private readonly WebApplication _app;
    private readonly string _clientSecret;

    public ConcurrentDictionary<string, CatalogListing> Listings { get; } = new();
    public ConcurrentDictionary<string, JsonElement> Reservations { get; } = new();
    public ConcurrentQueue<RecordedRequest> Requests { get; } = new();

    /// <summary>When set, the reserve endpoint answers 409 with these rejections instead of reserving.</summary>
    public volatile List<object>? RejectReserveWith;

    public volatile int ListingStatus; // 0 = normal, otherwise this HTTP status for every listing read
    public volatile int ReserveStatus; // 0 = normal, otherwise this HTTP status for reserve
    public volatile int TokenStatus; // 0 = normal, otherwise this HTTP status from the token endpoint

    public string Url { get; }

    public sealed record RecordedRequest(string Method, string Path, string? Authorization, string Body);

    public FakeCatalogServer(string clientSecret)
    {
        _clientSecret = clientSecret;
        foreach (var l in new[] { Seed.Sourdough(), Seed.Croissant(), Seed.Latte() }) Listings[l.Id] = l;

        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        _app = builder.Build();

        _app.Use(async (ctx, next) =>
        {
            ctx.Request.EnableBuffering();
            var body = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
            ctx.Request.Body.Position = 0;
            Requests.Enqueue(new RecordedRequest(
                ctx.Request.Method, ctx.Request.Path + ctx.Request.QueryString, ctx.Request.Headers.Authorization.FirstOrDefault(), body));
            await next();
        });

        _app.MapPost("/token", async (HttpContext ctx) =>
        {
            if (TokenStatus != 0) return Results.StatusCode(TokenStatus);
            var form = await ctx.Request.ReadFormAsync();
            if (form["grant_type"] != "client_credentials" || form["client_id"] != ClientId || form["client_secret"] != _clientSecret
                || form["scope"].ToString().EndsWith("/.default") == false)
                return Results.Json(new { error = "invalid_client" }, statusCode: 400);
            return Results.Ok(new { access_token = ServiceToken, token_type = "Bearer", expires_in = 3600 });
        });

        _app.MapGet("/catalog/listings/{id}", (string id) =>
        {
            if (ListingStatus != 0) return Results.StatusCode(ListingStatus);
            return Listings.TryGetValue(id, out var listing) ? Results.Json(listing, JsonOptions) : Results.Json(new { code = "not_found" }, statusCode: 404);
        });

        _app.MapPost("/catalog/stock/reservations", async (HttpContext ctx) =>
        {
            if (ctx.Request.Headers.Authorization.ToString() != $"Bearer {ServiceToken}") return Results.StatusCode(401);
            if (ReserveStatus != 0) return Results.StatusCode(ReserveStatus);
            var body = await JsonDocument.ParseAsync(ctx.Request.Body);
            var orderId = body.RootElement.GetProperty("orderId").GetString()!;
            if (RejectReserveWith is { } rejections)
                return Results.Json(new { code = "reservation_rejected", message = "no", lines = rejections }, statusCode: 409);
            return Reservations.TryAdd(orderId, body.RootElement.Clone()) ? Results.StatusCode(201) : Results.StatusCode(200);
        });

        _app.MapDelete("/catalog/stock/reservations/{orderId}", (string orderId, HttpContext ctx) =>
        {
            if (ctx.Request.Headers.Authorization.ToString() != $"Bearer {ServiceToken}") return Results.StatusCode(401);
            return Reservations.TryRemove(orderId, out _) ? Results.Ok() : Results.StatusCode(404);
        });

        _app.Start();
        Url = _app.Urls.First();
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public IEnumerable<RecordedRequest> To(string method, string pathPrefix) =>
        Requests.Where(r => r.Method == method && r.Path.StartsWith(pathPrefix, StringComparison.Ordinal));

    public async ValueTask DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
