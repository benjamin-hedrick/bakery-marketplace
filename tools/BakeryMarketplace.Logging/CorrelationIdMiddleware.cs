using System.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Logging;

/// <summary>
/// ASP.NET Core middleware that exposes the W3C trace ID of the current request (ADR-0016).
/// The value is <c>Activity.Current.TraceId</c>; an inbound <c>X-Correlation-Id</c> is never adopted, because a caller
/// could otherwise choose the identifier that appears in our logs. It is emitted on the response as a response-only alias
/// of the trace ID. With no W3C activity (no listener, hierarchical id format) a fresh trace ID is generated.
/// The <c>TraceId</c> log-scope key is the identifier; <c>CorrelationId</c> is kept as a transition alias.
/// See WI-TOOL-002 and WI-PORT-005.
/// </summary>
public class CorrelationIdMiddleware
{
    public const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next ?? throw new ArgumentNullException(nameof(next));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (context is null) throw new ArgumentNullException(nameof(context));

        var activity = Activity.Current;
        var correlationId = activity is { IdFormat: ActivityIdFormat.W3C }
            ? activity.TraceId.ToHexString()
            : ActivityTraceId.CreateRandom().ToHexString();

        context.Response.Headers[HeaderName] = correlationId;
        context.Items[HeaderName] = correlationId;

        using (_logger.BeginScope(new Dictionary<string, object>
        {
            ["TraceId"] = correlationId,
            ["CorrelationId"] = correlationId
        }))
        {
            await _next(context);
        }
    }
}
