using BakeryMarketplace.Caching;
using BakeryMarketplace.Eventing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// The one place a service switches chaos on (ADR-0024): <c>builder.Services.AddBakeryChaos(builder.Configuration, builder.Environment)</c>, after the
/// service's own registrations. With <c>Chaos:Enabled</c> unset or false it only registers <see cref="ChaosRuntime.Disabled"/>. With it set it checks
/// the gate (<see cref="ChaosGate"/>), loads the scenario named by <c>Chaos:Scenario</c>, wraps what is registered for each layer the scenario
/// names, and adds the response indicator and a startup warning. Nothing else in the service changes.
/// </summary>
public static class ChaosServiceExtensions
{
    public static IServiceCollection AddBakeryChaos(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        if (!configuration.GetValue("Chaos:Enabled", false))
        {
            services.AddSingleton(ChaosRuntime.Disabled);
            return services;
        }

        var deployment = configuration[ChaosGate.DeploymentSetting];
        ChaosGate.Require(environment.EnvironmentName, deployment); // fails at startup, not at first use

        var reference = configuration["Chaos:Scenario"];
        if (string.IsNullOrWhiteSpace(reference))
            throw new InvalidOperationException("Chaos:Enabled is true but Chaos:Scenario names no scenario.");
        var scenario = ChaosScenario.Load(ChaosScenarioLocator.Resolve(reference, environment.ContentRootPath));

        services.AddSingleton(sp => new ChaosRuntime(
            scenario, environment.EnvironmentName, deployment, sp.GetRequiredService<ILoggerFactory>().CreateLogger("BakeryMarketplace.Chaos")));
        services.AddTransient<IStartupFilter, ChaosStartupFilter>();

        if (scenario.HasLayer(ChaosEventTransport.LayerName))
            DecorateEvents(services);

        return services;
    }

    /// <summary>
    /// Wraps the cache store registered for <see cref="ICacheProvider"/> with the cache layer, when a scenario with that layer is on. Call it right
    /// after the <b>primary</b> store is registered and before <c>AddResilientCacheProvider</c> reads it, so the result is <c>Resilient(Chaos(primary))</c>.
    /// </summary>
    public static IServiceCollection AddChaosCachePrimary(this IServiceCollection services)
    {
        var original = LastDescriptor(services, typeof(ICacheProvider))
            ?? throw new InvalidOperationException("AddChaosCachePrimary needs the primary ICacheProvider to be registered first.");
        services.Remove(original);
        services.Add(ServiceDescriptor.Describe(
            typeof(ICacheProvider),
            sp => sp.WrapCachePrimary((ICacheProvider)Build(sp, original)),
            original.Lifetime));
        return services;
    }

    /// <summary>For a service that builds its primary store inline: returns it wrapped with the cache layer when a scenario with that layer is on, otherwise unchanged.</summary>
    public static ICacheProvider WrapCachePrimary(this IServiceProvider services, ICacheProvider primary)
    {
        var runtime = services.GetService<ChaosRuntime>();
        return runtime is { Enabled: true } && runtime.Scenario!.HasLayer(ChaosCacheProvider.LayerName)
            ? new ChaosCacheProvider(primary, runtime)
            : primary;
    }

    private static void DecorateEvents(IServiceCollection services)
    {
        var publisher = LastDescriptor(services, typeof(IEventPublisher));
        var subscriber = LastDescriptor(services, typeof(IEventSubscriber));
        if (publisher is null || subscriber is null)
            throw new InvalidOperationException("The chaos 'events' layer needs the event transport registered first: call AddBakeryEvents before AddBakeryChaos.");

        services.Remove(publisher);
        services.Remove(subscriber);
        services.AddSingleton(sp => new ChaosEventTransport(
            (IEventPublisher)Build(sp, publisher), (IEventSubscriber)Build(sp, subscriber), sp.GetRequiredService<ChaosRuntime>()));
        services.AddSingleton<IEventPublisher>(sp => sp.GetRequiredService<ChaosEventTransport>());
        services.AddSingleton<IEventSubscriber>(sp => sp.GetRequiredService<ChaosEventTransport>());
    }

    private static ServiceDescriptor? LastDescriptor(IServiceCollection services, Type serviceType) =>
        services.LastOrDefault(d => d.ServiceType == serviceType && !d.IsKeyedService);

    private static object Build(IServiceProvider sp, ServiceDescriptor descriptor) =>
        descriptor.ImplementationInstance
        ?? descriptor.ImplementationFactory?.Invoke(sp)
        ?? ActivatorUtilities.CreateInstance(sp, descriptor.ImplementationType!);
}

/// <summary>Finds a scenario by name: a path as given, or <c>chaos/scenarios/&lt;name&gt;.json</c> searched upward from the content root, the app folder and the working directory.</summary>
public static class ChaosScenarioLocator
{
    public static string Resolve(string reference, string contentRoot)
    {
        if (reference.EndsWith(".json", StringComparison.OrdinalIgnoreCase) || reference.Contains('/') || reference.Contains('\\'))
        {
            var path = Path.GetFullPath(reference, contentRoot);
            return File.Exists(path) ? path : throw new FileNotFoundException($"Chaos scenario file not found: {path}");
        }

        foreach (var start in new[] { contentRoot, AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "chaos", "scenarios", reference + ".json");
                if (File.Exists(candidate)) return candidate;
            }
        }

        throw new FileNotFoundException($"Chaos scenario '{reference}' not found under any chaos/scenarios folder above {contentRoot}.");
    }
}
