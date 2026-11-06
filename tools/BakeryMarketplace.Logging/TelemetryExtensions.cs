using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace BakeryMarketplace.Logging;

/// <summary>
/// OpenTelemetry tracing for the C# services (ADR-0016). Instruments inbound ASP.NET Core requests and outbound
/// <c>HttpClient</c> calls, and listens to the event backbone's consumer spans. Traces leave the process over OTLP
/// only when <c>OTEL_EXPORTER_OTLP_ENDPOINT</c> is set, so the viewer (Aspire dashboard locally, Jaeger later) is
/// configuration and no code here knows about it. Without an endpoint the instrumentation still runs, which gives every
/// request a real W3C trace ID for <see cref="CorrelationIdMiddleware"/> and for logs. See WI-PORT-005.
/// Request headers, bodies and tokens are not captured: this registration sets no header-capture or enrichment options.
/// A service that keeps its own metrics names their <see cref="System.Diagnostics.Metrics.Meter"/>s in <c>meters</c>; those leave the process the same way.
/// </summary>
public static class TelemetryExtensions
{
    public const string EventingSourceName = "BakeryMarketplace.Eventing";

    public static IServiceCollection AddBakeryTelemetry(
        this IServiceCollection services, IConfiguration configuration, string serviceName, params string[] meters)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        if (string.IsNullOrWhiteSpace(serviceName)) throw new ArgumentException("A service name is required.", nameof(serviceName));

        var export = !string.IsNullOrWhiteSpace(configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(serviceName))
            .WithTracing(tracing =>
            {
                tracing
                    .AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSource(EventingSourceName);
                if (export) tracing.AddOtlpExporter();
            });
        if (meters.Length > 0)
        {
            services.AddOpenTelemetry().WithMetrics(metrics =>
            {
                foreach (var meter in meters) metrics.AddMeter(meter);
                if (export) metrics.AddOtlpExporter();
            });
        }
        return services;
    }
}
