using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Logging;

/// <summary>
/// Extension methods for registering correlation-ID middleware and structured logging.
/// See WI-TOOL-002.
/// </summary>
public static class LoggingExtensions
{
    /// <summary>
    /// Registers <see cref="CorrelationIdMiddleware"/> in the ASP.NET Core request pipeline.
    /// </summary>
    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);
        return app.UseMiddleware<CorrelationIdMiddleware>();
    }

    /// <summary>
    /// Emits a structured log entry with ServiceName and optional EventType property scopes.
    /// </summary>
    public static void LogStructuredEvent(
        this ILogger logger,
        LogLevel logLevel,
        string serviceName,
        string message,
        string? eventType = null,
        Exception? exception = null)
    {
        ArgumentNullException.ThrowIfNull(logger);

        var state = new Dictionary<string, object>
        {
            ["ServiceName"] = serviceName
        };

        if (!string.IsNullOrEmpty(eventType))
        {
            state["EventType"] = eventType;
        }

        using (logger.BeginScope(state))
        {
            if (exception is not null)
            {
                logger.Log(logLevel, exception, "{Message}", message);
            }
            else
            {
                logger.Log(logLevel, "{Message}", message);
            }
        }
    }
}
