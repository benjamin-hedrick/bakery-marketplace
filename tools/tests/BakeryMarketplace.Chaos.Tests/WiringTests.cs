using BakeryMarketplace.Caching;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Chaos.Tests;

public sealed class WiringTests
{
    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build();

    private static ServiceCollection WithEvents()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddBakeryEvents(Config(("Events:Backend", "inmemory")), "test-service");
        return services;
    }

    private static DomainEventEnvelope<string> Make(string payload = "p") =>
        new(Guid.NewGuid(), "WiringTest", 1, DateTimeOffset.UtcNow, "Test", "agg", 1, payload);

    [Fact]
    public void WithoutChaosEnabled_NothingIsWrapped_AndTheRuntimeIsDisabled()
    {
        var services = WithEvents();
        services.AddBakeryChaos(Config(), new FakeHostEnvironment("Development"));
        using var provider = services.BuildServiceProvider();

        Assert.IsType<InMemoryEventTransport>(provider.GetRequiredService<IEventPublisher>());
        Assert.False(provider.GetRequiredService<ChaosRuntime>().Enabled);
    }

    [Fact]
    public void ANamedScenarioInDevelopmentWrapsTheEventTransport_PublisherAndSubscriberAreOneObject()
    {
        var services = WithEvents();
        services.AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker")), new FakeHostEnvironment("Development"));
        using var provider = services.BuildServiceProvider();

        var publisher = Assert.IsType<ChaosEventTransport>(provider.GetRequiredService<IEventPublisher>());
        Assert.Same(publisher, provider.GetRequiredService<IEventSubscriber>());
        Assert.Equal("flaky-broker", provider.GetRequiredService<ChaosRuntime>().Scenario!.Name);
    }

    [Fact]
    public async Task TheWrappedTransportInjectsTheScenariosFaults_AndTheJournalSaysSo()
    {
        var services = WithEvents();
        services.AddBakeryChaos(
            Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", RepoChaos.Path("scenarios/flaky-broker.json"))), new FakeHostEnvironment("Development"));
        using var provider = services.BuildServiceProvider();
        var publisher = provider.GetRequiredService<IEventPublisher>();
        var runtime = provider.GetRequiredService<ChaosRuntime>();
        var failures = 0;
        for (var i = 0; i < 40; i++)
        {
            try { await publisher.PublishAsync(Make()); }
            catch (EventTransportException) { failures++; }
        }

        Assert.InRange(failures, 1, 39); // publishFailureRate 0.3: some fail, not all
        Assert.Equal(failures, runtime.Journal.Count("events", "publishFailure")); // what the test saw is what the journal says
    }

    [Fact]
    public async Task TheSameScenarioHitsTheSameEventsOnEveryRun()
    {
        var ids = Enumerable.Range(0, 60).Select(_ => Guid.NewGuid()).ToList(); // fixed for both runs

        async Task<string> Run()
        {
            var services = WithEvents();
            services.AddBakeryChaos(
                Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", RepoChaos.Path("scenarios/flaky-broker.json"))), new FakeHostEnvironment("Development"));
            using var provider = services.BuildServiceProvider();
            var publisher = provider.GetRequiredService<IEventPublisher>();
            var outcome = "";
            foreach (var id in ids)
            {
                try
                {
                    await publisher.PublishAsync(Make() with { EventId = id });
                    outcome += "o";
                }
                catch (EventTransportException) { outcome += "x"; }
            }

            return outcome;
        }

        var first = await Run();
        Assert.Equal(first, await Run());
        Assert.Contains('x', first);
    }

    [Theory]
    [InlineData("Production", null)]
    [InlineData("Production", "uat")]
    [InlineData("Staging", null)]
    public void EnablingChaosWhereItIsNotAllowedStopsTheHostAtStartup(string host, string? deployment)
    {
        var services = WithEvents();
        var settings = new List<(string, string)> { ("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker") };
        if (deployment is not null) settings.Add((ChaosGate.DeploymentSetting, deployment));

        Assert.Throws<InvalidOperationException>(() => services.AddBakeryChaos(Config(settings.ToArray()), new FakeHostEnvironment(host)));
    }

    [Fact]
    public void TheDeployedDevStackIsAllowed_ItRunsAsProductionButSaysItIsDev()
    {
        var services = WithEvents();
        services.AddBakeryChaos(
            Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker"), (ChaosGate.DeploymentSetting, "dev")), new FakeHostEnvironment("Production"));
        using var provider = services.BuildServiceProvider();
        Assert.IsType<ChaosEventTransport>(provider.GetRequiredService<IEventPublisher>());
    }

    [Fact]
    public void AMissingScenarioFile_AndAnEnabledFlagWithNoScenario_BothFailAtStartup()
    {
        Assert.Throws<FileNotFoundException>(() =>
            WithEvents().AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", "no-such-scenario")), new FakeHostEnvironment("Development")));
        Assert.Throws<InvalidOperationException>(() =>
            WithEvents().AddBakeryChaos(Config(("Chaos:Enabled", "true")), new FakeHostEnvironment("Development")));
    }

    [Fact]
    public void ALayerThatThisProcessHasNoInterfaceFor_IsReportedAsNotApplied_NotAnError()
    {
        // A scenario is shared by every process of a stack; the admin service has no event transport, so the events layer has nothing to wrap there.
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker")), new FakeHostEnvironment("Development"));
        using var provider = services.BuildServiceProvider();

        var plan = provider.GetRequiredService<ChaosPlan>();
        Assert.Empty(plan.Applied);
        Assert.Equal(["events"], plan.NotApplied);
    }

    [Fact]
    public void ThePlanSaysWhichLayersWereWrapped_OnceTheyAreUsed()
    {
        var services = WithEvents();
        services.AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker")), new FakeHostEnvironment("Development"));
        using var provider = services.BuildServiceProvider();
        var plan = provider.GetRequiredService<ChaosPlan>();
        Assert.Equal(["events"], plan.NotApplied); // registered, not resolved yet

        _ = provider.GetRequiredService<IEventPublisher>();

        Assert.Equal(["events"], plan.Applied);
        Assert.Empty(plan.NotApplied);
    }

    private interface IThing
    {
        string Name { get; }
    }

    private sealed class Thing : IThing
    {
        public string Name => "real";
    }

    private sealed class Wrapped(IThing inner, ChaosLayer layer) : IThing
    {
        public string Name => $"wrapped({inner.Name}, active={layer.Active})";
    }

    [Fact]
    public void AddChaosLayer_WrapsAServiceOwnedInterface_OnlyWhenTheScenarioHasThatLayer()
    {
        var scenarioFile = Path.Combine(Path.GetTempPath(), $"chaos-{Guid.NewGuid():N}.json");
        File.WriteAllText(scenarioFile, """{ "name": "t", "seed": 1, "layers": { "payment": { "latencyMs": 1 } } }""");
        try
        {
            var on = new ServiceCollection();
            on.AddLogging();
            on.AddSingleton<IThing, Thing>();
            on.AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", scenarioFile)), new FakeHostEnvironment("Development"));
            on.AddChaosLayer<IThing>("payment", (inner, layer) => new Wrapped(inner, layer));
            on.AddChaosLayer<IThing>("catalog", (inner, layer) => new Wrapped(inner, layer)); // the scenario has no catalog layer: ignored
            using var wrapped = on.BuildServiceProvider();
            Assert.Equal("wrapped(real, active=True)", wrapped.GetRequiredService<IThing>().Name);
            Assert.Equal(["payment"], wrapped.GetRequiredService<ChaosPlan>().Applied);

            var off = new ServiceCollection();
            off.AddSingleton<IThing, Thing>();
            off.AddBakeryChaos(Config(), new FakeHostEnvironment("Development"));
            off.AddChaosLayer<IThing>("payment", (inner, layer) => new Wrapped(inner, layer));
            using var plain = off.BuildServiceProvider();
            Assert.Equal("real", plain.GetRequiredService<IThing>().Name);
        }
        finally
        {
            File.Delete(scenarioFile);
        }
    }

    [Fact]
    public void AddChaosLayer_BeforeAddBakeryChaos_IsAMistakeThatFailsLoudly()
    {
        var services = new ServiceCollection();
        services.AddSingleton<IThing, Thing>();
        Assert.Throws<InvalidOperationException>(() => services.AddChaosLayer<IThing>("payment", (inner, layer) => new Wrapped(inner, layer)));
    }

    [Fact]
    public void TheRepositoryAndBroadcastLayersWrapEveryRegisteredRepositoryBatchFactoryAndBroadcast()
    {
        var scenarioFile = Path.Combine(Path.GetTempPath(), $"chaos-{Guid.NewGuid():N}.json");
        File.WriteAllText(scenarioFile, """{ "name": "t", "seed": 1, "layers": { "repository": { "failureRate": 0.1 }, "broadcast": { "dropRate": 0.1 } } }""");
        try
        {
            var database = new FakeDatabase();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddSingleton<IRepository<Doc>>(new FakeRepository<Doc>(d => d.Id, database));
            services.AddSingleton<IRepository<Other>>(new FakeRepository<Other>(d => d.Id, database));
            services.AddSingleton<IBatchFactory>(new FakeBatchFactory(database));
            var broadcast = new InMemoryBroadcast();
            services.AddSingleton<IBroadcastPublisher>(broadcast);
            services.AddSingleton<IBroadcastSubscriber>(broadcast);
            services.AddBakeryChaos(Config(("Chaos:Enabled", "true"), ("Chaos:Scenario", scenarioFile)), new FakeHostEnvironment("Development"));
            using var provider = services.BuildServiceProvider();

            Assert.IsType<ChaosRepository<Doc>>(provider.GetRequiredService<IRepository<Doc>>());
            Assert.IsType<ChaosRepository<Other>>(provider.GetRequiredService<IRepository<Other>>());
            Assert.IsType<ChaosBatchFactory>(provider.GetRequiredService<IBatchFactory>());
            Assert.IsType<ChaosBroadcastPublisher>(provider.GetRequiredService<IBroadcastPublisher>());
            Assert.IsType<ChaosBroadcastSubscriber>(provider.GetRequiredService<IBroadcastSubscriber>());
            Assert.Equal(["broadcast", "repository"], provider.GetRequiredService<ChaosPlan>().Applied);
        }
        finally
        {
            File.Delete(scenarioFile);
        }
    }

    public sealed record Doc([property: Newtonsoft.Json.JsonProperty("id")] string Id);

    public sealed record Other([property: Newtonsoft.Json.JsonProperty("id")] string Id);

    [Fact]
    public async Task TheCacheLayerSitsUnderTheResilientProvider_SoTheFallbackIsWhatGetsExercised()
    {
        // Resilient(Chaos(primary)): the primary always fails, the resilient layer absorbs it and serves from the local fallback.
        var scenario = ChaosScenario.Of("always-failing-cache", 1, "cache", ("failureRate", 1));
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(ChaosRuntime.ForTests(scenario));
        services.AddSingleton<ICacheProvider>(new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()))); // stands in for Redis
        services.AddChaosCachePrimary();
        services.AddResilientCacheProvider();
        using var provider = services.BuildServiceProvider();

        Assert.IsType<ChaosCacheProvider>(provider.GetRequiredService<ICacheProvider>());
        var resilient = provider.GetRequiredService<ResilientCacheProvider>();
        await resilient.SetAsync("k", "v");
        var result = await resilient.GetAsync<string>("k");

        Assert.True(provider.GetRequiredService<ChaosRuntime>().Journal.Count("cache", "failure") > 0, "chaos must actually have failed the primary");
        Assert.True(result.Found);
        Assert.Equal("v", result.Value);
    }

    [Fact]
    public void WrapCachePrimary_ReturnsThePrimaryUnchanged_WhenChaosIsOffOrHasNoCacheLayer()
    {
        var primary = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        using var off = new ServiceCollection().AddSingleton(ChaosRuntime.Disabled).BuildServiceProvider();
        using var otherLayer = new ServiceCollection().AddSingleton(ChaosRuntime.ForTests(ChaosScenario.Of("n", 1, "events", ("dropRate", 1)))).BuildServiceProvider();
        using var none = new ServiceCollection().BuildServiceProvider();

        Assert.Same(primary, off.WrapCachePrimary(primary));
        Assert.Same(primary, otherLayer.WrapCachePrimary(primary));
        Assert.Same(primary, none.WrapCachePrimary(primary));
    }

    private static async Task<WebApplication> StartHost(string environment, params (string Key, string Value)[] settings)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = environment });
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(settings.ToDictionary(s => s.Key, s => (string?)s.Value));
        builder.Services.AddBakeryEvents(Config(("Events:Backend", "inmemory")), "test-service");
        builder.Services.AddBakeryChaos(builder.Configuration, builder.Environment);
        var app = builder.Build();
        app.MapGet("/quiet", () => "ok");
        app.MapGet("/faulty", (ChaosRuntime runtime) =>
        {
            runtime.Layer("events").Record("drop", "secret-key-that-must-not-leak");
            runtime.Layer("cache").Record("failure", "another-key");
            return "ok";
        });
        await app.StartAsync();
        return app;
    }

    [Fact]
    public async Task WithChaosOn_EveryResponseNamesTheScenario_AndListsOnlyTheFaultsOfThatRequest()
    {
        await using var app = await StartHost("Development", ("Chaos:Enabled", "true"), ("Chaos:Scenario", "flaky-broker"));
        var client = app.GetTestClient();

        var quiet = await client.GetAsync("/quiet");
        Assert.Equal("flaky-broker", quiet.Headers.GetValues(ChaosIndicatorMiddleware.ScenarioHeader).Single());
        Assert.False(quiet.Headers.Contains(ChaosIndicatorMiddleware.InjectedHeader));

        var faulty = await client.GetAsync("/faulty");
        Assert.Equal("cache:failure,events:drop", faulty.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.DoesNotContain("secret", string.Join(" ", faulty.Headers.SelectMany(h => h.Value)));

        var after = await client.GetAsync("/quiet"); // the earlier request's faults do not leak into this one
        Assert.False(after.Headers.Contains(ChaosIndicatorMiddleware.InjectedHeader));
    }

    [Fact]
    public async Task WithChaosOff_NoResponseCarriesAnIndicator()
    {
        await using var app = await StartHost("Development");
        var response = await app.GetTestClient().GetAsync("/quiet");
        Assert.False(response.Headers.Contains(ChaosIndicatorMiddleware.ScenarioHeader));
        Assert.False(response.Headers.Contains(ChaosIndicatorMiddleware.InjectedHeader));
    }

    [Fact]
    public async Task ARequestHeaderCannotSwitchChaosOnOrChangeTheIndicator_TheIndicatorIsResponseOnly()
    {
        await using var app = await StartHost("Development");
        using var request = new HttpRequestMessage(HttpMethod.Get, "/quiet");
        request.Headers.Add(ChaosIndicatorMiddleware.ScenarioHeader, "flaky-broker");
        request.Headers.Add("X-Chaos", "on");
        var response = await app.GetTestClient().SendAsync(request);

        Assert.False(response.Headers.Contains(ChaosIndicatorMiddleware.ScenarioHeader));
        Assert.False(app.Services.GetRequiredService<ChaosRuntime>().Enabled);
    }
}
