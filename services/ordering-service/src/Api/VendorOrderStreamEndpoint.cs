using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using OrderingService.Checkout;
using OrderingService.Streaming;

namespace OrderingService.Api;

/// <summary>
/// <c>GET /ordering/vendor/orders/stream</c> (ADR-0021): Server-Sent Events carrying each change to the calling vendor's orders, whole, in the
/// same shape the list returns plus <c>lastSequence</c>. The vendor id always comes from the validated token. A stream is never longer-lived than
/// the token that opened it: at the token's expiry (or the maximum age, whichever is first) the server sends an <c>expired</c> event and ends it.
/// Nothing is replayed: a client lists first, then applies what arrives. The token is read only by the authentication middleware; it is never
/// logged here.
/// </summary>
public static class VendorOrderStreamEndpoint
{
    public static IEndpointRouteBuilder MapVendorOrderStreamEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/ordering/vendor/orders/stream", async (
            HttpContext http, VendorOrderStreamHub hub, IOptions<VendorStreamOptions> options, IHostApplicationLifetime lifetime, ILoggerFactory loggers) =>
        {
            var logger = loggers.CreateLogger("OrderingService.VendorStream");
            var vendorId = CheckoutEndpoints.SubjectOf(http.User);
            if (vendorId is null) return Results.Unauthorized();

            var o = options.Value;
            var now = DateTimeOffset.UtcNow;
            if (TokenExpiry(http.User) is not { } tokenExpiry || tokenExpiry <= now) return Results.Unauthorized();
            var deadline = now + o.MaxAge < tokenExpiry ? now + o.MaxAge : tokenExpiry;
            var endReason = deadline == tokenExpiry ? "token" : "max-age";

            VendorStreamSession? stream;
            try
            {
                stream = await hub.OpenAsync(vendorId, http.RequestAborted);
            }
            catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested)
            {
                return Results.Empty;
            }
            catch (Exception e)
            {
                logger.LogError(e, "A vendor order stream could not be opened: the live channel is unavailable");
                return Unavailable(http, 5);
            }
            if (stream is null) return Unavailable(http, 30);

            var response = http.Response;
            response.StatusCode = StatusCodes.Status200OK;
            response.ContentType = "text/event-stream";
            response.Headers.CacheControl = "private, no-store";
            response.Headers["X-Accel-Buffering"] = "no"; // proxies that honour it do not buffer the stream
            http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

            using var linked = CancellationTokenSource.CreateLinkedTokenSource(http.RequestAborted, stream.Closed, lifetime.ApplicationStopping);
            var token = linked.Token;
            try
            {
                await WriteAsync(response, "retry: 3000\n: connected\n\n", token);
                if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("A vendor order stream opened ({Open} open on this instance)", hub.OpenCount);

                var lastWrite = DateTimeOffset.UtcNow;
                while (!token.IsCancellationRequested)
                {
                    var remaining = deadline - DateTimeOffset.UtcNow;
                    if (remaining <= TimeSpan.Zero)
                    {
                        await WriteAsync(response, $"event: expired\ndata: {{\"reason\":\"{endReason}\"}}\n\n", CancellationToken.None);
                        break;
                    }

                    var wait = Min(Min(remaining, o.Heartbeat - (DateTimeOffset.UtcNow - lastWrite)), TimeSpan.FromHours(1));
                    if (wait < TimeSpan.Zero) wait = TimeSpan.Zero;
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                    timeout.CancelAfter(wait);
                    try
                    {
                        var message = await stream.Queue.Reader.ReadAsync(timeout.Token);
                        await WriteAsync(response, $"event: order\nid: {message.OrderId}:{message.Sequence}\ndata: {message.Json}\n\n", token);
                        hub.RecordSent(message);
                        lastWrite = DateTimeOffset.UtcNow;
                    }
                    catch (OperationCanceledException)
                    {
                        if (token.IsCancellationRequested) break; // closed by the hub, the client left, or the service is stopping
                        // The wait ended: either the deadline is due (the loop top ends the stream) or a heartbeat is.
                        if (deadline - DateTimeOffset.UtcNow > TimeSpan.Zero)
                        {
                            await WriteAsync(response, ": heartbeat\n\n", token);
                            lastWrite = DateTimeOffset.UtcNow;
                        }
                    }
                }

                if (stream.CloseReason is { } closed && !http.RequestAborted.IsCancellationRequested)
                {
                    await WriteAsync(response, $"event: closed\ndata: {{\"reason\":\"{closed}\"}}\n\n", CancellationToken.None);
                }
            }
            catch (OperationCanceledException)
            {
                // The client went away, the hub closed the stream, or the service is stopping.
            }
            catch (IOException)
            {
                // The connection was cut while writing.
            }
            finally
            {
                await hub.ReleaseAsync(stream);
                if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("A vendor order stream closed ({Open} open on this instance)", hub.OpenCount);
            }
            return Results.Empty;
        }).RequireAuthorization("VendorRole");

        return app;
    }

    /// <summary>The token's <c>exp</c> claim, or null when it has none (then the stream is refused: it would have no credential lifetime to end by).</summary>
    private static DateTimeOffset? TokenExpiry(ClaimsPrincipal user) =>
        long.TryParse(user.FindFirst("exp")?.Value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;

    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    private static async Task WriteAsync(HttpResponse response, string text, CancellationToken ct)
    {
        await response.Body.WriteAsync(Encoding.UTF8.GetBytes(text), ct);
        await response.Body.FlushAsync(ct);
    }

    private static IResult Unavailable(HttpContext http, int retryAfterSeconds)
    {
        http.Response.Headers.RetryAfter = retryAfterSeconds.ToString(CultureInfo.InvariantCulture);
        return Results.Json(new ApiError("stream_unavailable", "Live updates are not available right now; poll instead."), statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}
