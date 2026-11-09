using BakeryMarketplace.Caching;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// What a process was asked to do and what it did: the scenario (none when chaos is off) and the layers it actually wrapped. A scenario is shared by
/// every process of a stack, and a process only has some of the interfaces (the admin service has no event transport, notification has no payment
/// processor), so a layer the scenario names but this process does not have is reported as not applicable, not as an error. A layer name that no
/// process knows is still rejected when the scenario is loaded.
/// </summary>
public sealed class ChaosPlan
{
    public static readonly ChaosPlan Off = new(null);

    private readonly HashSet<string> _applied = [];

    public ChaosPlan(ChaosScenario? scenario) => Scenario = scenario;

    public ChaosScenario? Scenario { get; }

    public bool Enabled => Scenario is not null;

    public bool Wants(string layer) => Scenario?.HasLayer(layer) == true;

    public IReadOnlyList<string> Applied
    {
        get
        {
            lock (_applied) return _applied.Order(StringComparer.Ordinal).ToArray();
        }
    }

    /// <summary>Layers the scenario names that this process has not wrapped (yet): no such interface here, or not resolved so far.</summary>
    public IReadOnlyList<string> NotApplied => Scenario is null ? [] : Scenario.Layers.Keys.Except(Applied).Order(StringComparer.Ordinal).ToArray();

    internal void MarkApplied(string layer)
    {
        lock (_applied) _applied.Add(layer);
    }
}

/// <summary>
/// The one place a service switches chaos on (ADR-0024): <c>builder.Services.AddBakeryChaos(builder.Configuration, builder.Environment)</c>, after the
/// service's own registrations. With <c>Chaos:Enabled</c> unset or false it only registers <see cref="ChaosRuntime.Disabled"/>. With it set it checks
/// the gate (<see cref="ChaosGate"/>), loads the scenario named by <c>Chaos:Scenario</c>, wraps what is registered for each layer the scenario
/// names and this process has (events, repositories, broadcast), and adds the response indicator and a startup warning. A service that owns an
/// interface of its own (payment, the catalog gateway, the notification sender) wraps it with <see cref="AddChaosLayer{TService}"/>.
/// </summary>
public static class ChaosServiceExtensions
{
    public static IServiceCollection AddBakeryChaos(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        if (!configuration.GetValue("Chaos:Enabled", false))
        {
            services.AddSingleton(ChaosRuntime.Disabled);
            services.AddSingleton(ChaosPlan.Off);
            return services;
        }

        var deployment = configuration[ChaosGate.DeploymentSetting];
        ChaosGate.Require(environment.EnvironmentName, deployment); // fails at startup, not at first use

        var reference = configuration["Chaos:Scenario"];
        if (string.IsNullOrWhiteSpace(reference))
            throw new InvalidOperationException("Chaos:Enabled is true but Chaos:Scenario names no scenario.");
        var scenario = ChaosScenario.Load(ChaosScenarioLocator.Resolve(reference, environment.ContentRootPath));
        var plan = new ChaosPlan(scenario);

        services.AddSingleton(plan);
        services.AddSingleton(sp => new ChaosRuntime(
            scenario, environment.EnvironmentName, deployment, sp.GetRequiredService<ILoggerFactory>().CreateLogger("BakeryMarketplace.Chaos")));
        services.AddTransient<IStartupFilter, ChaosStartupFilter>();

        if (plan.Wants(ChaosEventTransport.LayerName)) DecorateEvents(services, plan);
        if (plan.Wants(ChaosRepository<object>.LayerName)) DecorateRepositories(services, plan);
        if (plan.Wants(ChaosBroadcastPublisher.LayerName)) DecorateBroadcast(services, plan);

        return services;
    }

    /// <summary>
    /// Wraps what the service registered for <typeparamref name="TService"/> with <paramref name="wrap"/> when the scenario has <paramref name="layer"/>;
    /// otherwise does nothing. For the interfaces a service owns (they are not visible to this library). Call it after <see cref="AddBakeryChaos"/>
    /// and after the service registers <typeparamref name="TService"/>.
    /// </summary>
    public static IServiceCollection AddChaosLayer<TService>(this IServiceCollection services, string layer, Func<TService, ChaosLayer, TService> wrap)
        where TService : class
    {
        var plan = PlanOf(services);
        if (!plan.Wants(layer)) return services;
        var original = LastDescriptor(services, typeof(TService));
        if (original is null) return services; // this process does not have the interface: reported as not applicable

        services.Remove(original);
        services.Add(ServiceDescriptor.Describe(
            typeof(TService),
            sp =>
            {
                plan.MarkApplied(layer);
                return wrap((TService)Build(sp, original), sp.GetRequiredService<ChaosRuntime>().Layer(layer));
            },
            original.Lifetime));
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
        if (runtime is not { Enabled: true } || !runtime.Scenario!.HasLayer(ChaosCacheProvider.LayerName)) return primary;
        services.GetService<ChaosPlan>()?.MarkApplied(ChaosCacheProvider.LayerName);
        return new ChaosCacheProvider(primary, runtime);
    }

    private static ChaosPlan PlanOf(IServiceCollection services) =>
        services.LastOrDefault(d => d.ServiceType == typeof(ChaosPlan))?.ImplementationInstance as ChaosPlan
        ?? throw new InvalidOperationException("Call AddBakeryChaos before AddChaosLayer.");

    private static void DecorateEvents(IServiceCollection services, ChaosPlan plan)
    {
        var publisher = LastDescriptor(services, typeof(IEventPublisher));
        var subscriber = LastDescriptor(services, typeof(IEventSubscriber));
        if (publisher is null || subscriber is null) return; // no event transport in this process

        services.Remove(publisher);
        services.Remove(subscriber);
        services.AddSingleton(sp =>
        {
            plan.MarkApplied(ChaosEventTransport.LayerName);
            return new ChaosEventTransport((IEventPublisher)Build(sp, publisher), (IEventSubscriber)Build(sp, subscriber), sp.GetRequiredService<ChaosRuntime>());
        });
        services.AddSingleton<IEventPublisher>(sp => sp.GetRequiredService<ChaosEventTransport>());
        services.AddSingleton<IEventSubscriber>(sp => sp.GetRequiredService<ChaosEventTransport>());
    }

    private static void DecorateRepositories(IServiceCollection services, ChaosPlan plan)
    {
        var repositories = services
            .Where(d => !d.IsKeyedService && d.ServiceType.IsGenericType && d.ServiceType.GetGenericTypeDefinition() == typeof(IRepository<>))
            .ToList();
        foreach (var original in repositories)
        {
            var wrapper = typeof(ChaosRepository<>).MakeGenericType(original.ServiceType.GenericTypeArguments[0]);
            services.Remove(original);
            services.Add(ServiceDescriptor.Describe(
                original.ServiceType,
                sp =>
                {
                    plan.MarkApplied(ChaosRepository<object>.LayerName);
                    return Activator.CreateInstance(wrapper, Build(sp, original), sp.GetRequiredService<ChaosRuntime>())!;
                },
                original.Lifetime));
        }

        var batches = LastDescriptor(services, typeof(IBatchFactory));
        if (batches is not null)
        {
            services.Remove(batches);
            services.Add(ServiceDescriptor.Describe(
                typeof(IBatchFactory),
                sp => new ChaosBatchFactory((IBatchFactory)Build(sp, batches), sp.GetRequiredService<ChaosRuntime>()),
                batches.Lifetime));
        }
    }

    private static void DecorateBroadcast(IServiceCollection services, ChaosPlan plan)
    {
        var publisher = LastDescriptor(services, typeof(IBroadcastPublisher));
        var subscriber = LastDescriptor(services, typeof(IBroadcastSubscriber));
        if (publisher is not null)
        {
            services.Remove(publisher);
            services.Add(ServiceDescriptor.Describe(
                typeof(IBroadcastPublisher),
                sp =>
                {
                    plan.MarkApplied(ChaosBroadcastPublisher.LayerName);
                    return new ChaosBroadcastPublisher((IBroadcastPublisher)Build(sp, publisher), sp.GetRequiredService<ChaosRuntime>());
                },
                publisher.Lifetime));
        }

        if (subscriber is not null)
        {
            services.Remove(subscriber);
            services.Add(ServiceDescriptor.Describe(
                typeof(IBroadcastSubscriber),
                sp =>
                {
                    plan.MarkApplied(ChaosBroadcastPublisher.LayerName);
                    return new ChaosBroadcastSubscriber((IBroadcastSubscriber)Build(sp, subscriber), sp.GetRequiredService<ChaosRuntime>());
                },
                subscriber.Lifetime));
        }
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
