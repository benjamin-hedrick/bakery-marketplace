using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The response indicator (ADR-0024). While a scenario is on, every response carries <c>X-Chaos-Scenario: &lt;name&gt;</c>, and
/// <c>X-Chaos-Injected: layer:fault,...</c> lists the faults injected while that request was being served. It is response-only: nothing reads a
/// request header to switch chaos on (as with <c>X-Correlation-Id</c>, ADR-0016). It carries only the scenario name and the layer and fault
/// names, never keys, ids, payloads or the seed. It exists only where chaos is allowed to run, so it cannot appear in UAT or Production.
/// </summary>
public sealed class ChaosIndicatorMiddleware(RequestDelegate next, ChaosRuntime runtime)
{
    public const string ScenarioHeader = "X-Chaos-Scenario";
    public const string InjectedHeader = "X-Chaos-Injected";

    public async Task InvokeAsync(HttpContext context)
    {
        using var scope = ChaosRequestScope.Begin();
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[ScenarioHeader] = runtime.Scenario!.Name;
            var faults = scope.Faults;
            if (faults.Count > 0) context.Response.Headers[InjectedHeader] = string.Join(',', faults);
            return Task.CompletedTask;
        });
        await next(context);
    }
}

/// <summary>Puts the indicator at the head of the pipeline and logs one loud warning naming the scenario, so a running chaos scenario cannot be missed.</summary>
internal sealed class ChaosStartupFilter(ChaosRuntime runtime, ChaosPlan plan, ILoggerFactory loggers) : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        var logger = loggers.CreateLogger("BakeryMarketplace.Chaos");
        ChaosLog.ScenarioOn(logger, runtime.Scenario!.Name, runtime.Scenario.Seed, string.Join(", ", runtime.Scenario.Layers.Keys));
        // Once the host is up, say which of the scenario's layers this process actually wrapped, so a layer that has nothing to wrap here is visible.
        app.ApplicationServices.GetService<IHostApplicationLifetime>()?.ApplicationStarted.Register(() =>
            ChaosLog.LayersApplied(logger, runtime.Scenario!.Name, string.Join(", ", plan.Applied), string.Join(", ", plan.NotApplied)));
        app.UseMiddleware<ChaosIndicatorMiddleware>(runtime);
        next(app);
    };
}
