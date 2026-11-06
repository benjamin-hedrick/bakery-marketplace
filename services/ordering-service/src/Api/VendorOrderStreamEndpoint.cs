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
public static partial class VendorOrderStreamEndpoint
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
                LogAVendorOrderStreamCouldNot(logger, e);
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

            // One write, bounded in time. `until` ends it early (the client left, the stream was closed); the timeout ends it as a failure.
            async Task SendAsync(string text, CancellationToken until)
            {
                using var bounded = CancellationTokenSource.CreateLinkedTokenSource(until);
                bounded.CancelAfter(o.WriteTimeout);
                try
                {
                    await WriteAsync(response, text, bounded.Token);
                }
                catch (OperationCanceledException) when (bounded.IsCancellationRequested && !until.IsCancellationRequested)
                {
                    throw new WriteTimedOut();
                }
            }

            try
            {
                await SendAsync("retry: 3000\n: connected\n\n", token);
                if (logger.IsEnabled(LogLevel.Debug)) LogAVendorOrderStreamOpenedOpen(logger, hub.OpenCount);

                var lastWrite = DateTimeOffset.UtcNow;
                while (!token.IsCancellationRequested)
                {
                    var remaining = deadline - DateTimeOffset.UtcNow;
                    if (remaining <= TimeSpan.Zero)
                    {
                        await SendAsync($"event: expired\ndata: {{\"reason\":\"{endReason}\"}}\n\n", http.RequestAborted);
                        break;
                    }

                    var wait = Min(Min(remaining, o.Heartbeat - (DateTimeOffset.UtcNow - lastWrite)), TimeSpan.FromHours(1));
                    if (wait < TimeSpan.Zero) wait = TimeSpan.Zero;
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                    timeout.CancelAfter(wait);
                    try
                    {
                        var message = await stream.Queue.Reader.ReadAsync(timeout.Token);
                        await SendAsync($"event: order\nid: {message.OrderId}:{message.Sequence}\ndata: {message.Json}\n\n", token);
                        hub.RecordSent(message);
                        lastWrite = DateTimeOffset.UtcNow;
                    }
                    catch (OperationCanceledException)
                    {
                        if (token.IsCancellationRequested) break; // closed by the hub, the client left, or the service is stopping
                        // The wait ended: either the deadline is due (the loop top ends the stream) or a heartbeat is.
                        if (deadline - DateTimeOffset.UtcNow > TimeSpan.Zero)
                        {
                            await SendAsync(": heartbeat\n\n", token);
                            lastWrite = DateTimeOffset.UtcNow;
                        }
                    }
                }

                if (stream.CloseReason is { } closed && !http.RequestAborted.IsCancellationRequested)
                {
                    await SendAsync($"event: closed\ndata: {{\"reason\":\"{closed}\"}}\n\n", http.RequestAborted);
                }
            }
            catch (WriteTimedOut)
            {
                // The client holds the connection and does not read: the stream is closed and the connection dropped, which frees its place.
                hub.RecordClosedByServer("write-timeout");
                LogAVendorOrderStreamWasClosed(logger, (int)o.WriteTimeout.TotalMilliseconds);
                http.Abort();
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
                if (logger.IsEnabled(LogLevel.Debug)) LogAVendorOrderStreamClosedOpen(logger, hub.OpenCount);
            }
            return Results.Empty;
        }).RequireAuthorization("VendorRole");

        return app;
    }

    /// <summary>The token's <c>exp</c> claim, or null when it has none (then the stream is refused: it would have no credential lifetime to end by).</summary>
    private static DateTimeOffset? TokenExpiry(ClaimsPrincipal user) =>
        long.TryParse(user.FindFirst("exp")?.Value, out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : null;

    private static TimeSpan Min(TimeSpan a, TimeSpan b) => a < b ? a : b;

    /// <summary>A write to the client took longer than the write timeout.</summary>
    private sealed class WriteTimedOut : Exception;

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

    [LoggerMessage(Level = LogLevel.Error, Message = "A vendor order stream could not be opened: the live channel is unavailable")]
    private static partial void LogAVendorOrderStreamCouldNot(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Debug, Message = "A vendor order stream opened ({Open} open on this instance)")]
    private static partial void LogAVendorOrderStreamOpenedOpen(ILogger logger, int open);

    [LoggerMessage(Level = LogLevel.Warning, Message = "A vendor order stream was closed: the client did not read within {Timeout} ms")]
    private static partial void LogAVendorOrderStreamWasClosed(ILogger logger, int timeout);

    [LoggerMessage(Level = LogLevel.Debug, Message = "A vendor order stream closed ({Open} open on this instance)")]
    private static partial void LogAVendorOrderStreamClosedOpen(ILogger logger, int open);
}
