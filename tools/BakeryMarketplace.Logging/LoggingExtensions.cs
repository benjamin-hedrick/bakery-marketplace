using Microsoft.AspNetCore.Builder;

namespace BakeryMarketplace.Logging;

/// <summary>
/// Extension method for registering the correlation-ID middleware.
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
}
