using BakeryMarketplace.Data;

namespace CatalogService.Api;

/// <summary>
/// Register 206: a store that cannot be reached is a condition to try again later, not a bug. Any request that ends in
/// <see cref="StoreUnavailableException"/> answers 503 with <c>Retry-After</c> and a fixed sentence, as ordering's checkout does, instead of an
/// unhandled 500. Nothing about the store (address, status, exception) reaches the caller; the exception is logged.
/// </summary>
public static partial class StoreUnavailableResponse
{
    /// <summary>Seconds a caller is asked to wait before trying again.</summary>
    public const int RetryAfterSeconds = 5;

    public static IApplicationBuilder UseStoreUnavailableResponse(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (StoreUnavailableException e) when (!context.Response.HasStarted)
            {
                var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(StoreUnavailableResponse).FullName!);
                LogStoreUnavailable(logger, e, context.Request.Method, context.Request.Path);
                context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                context.Response.Headers.RetryAfter = RetryAfterSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
                context.Response.Headers.CacheControl = "no-store";
                await context.Response.WriteAsJsonAsync(new ApiError("store_unavailable", "The catalog could not be reached right now. Please try again shortly."));
            }
        });

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Method} {Path}: the store could not be reached; answered 503")]
    private static partial void LogStoreUnavailable(ILogger logger, Exception exception, string method, PathString path);
}
