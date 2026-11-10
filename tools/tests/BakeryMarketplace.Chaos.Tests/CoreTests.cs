using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace BakeryMarketplace.Chaos.Tests;

internal static class RepoChaos
{
    /// <summary>A file under the repository's <c>chaos/</c> folder, found by walking up from the test's folder.</summary>
    public static string Path(string relative)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = System.IO.Path.Combine(dir.FullName, "chaos", relative);
            if (File.Exists(candidate)) return candidate;
        }

        throw new FileNotFoundException($"chaos/{relative} not found above {AppContext.BaseDirectory}");
    }
}

internal sealed class FakeHostEnvironment(string name) : IHostEnvironment
{
    public string EnvironmentName { get; set; } = name;
    public string ApplicationName { get; set; } = "ChaosTests";
    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}

public sealed class ChaosDeciderTests
{
    public static IEnumerable<object[]> Vectors()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(RepoChaos.Path("test-vectors.json")));
        foreach (var v in doc.RootElement.GetProperty("vectors").EnumerateArray())
            yield return [v.GetProperty("seed").GetInt64(), v.GetProperty("layer").GetString()!, v.GetProperty("fault").GetString()!, v.GetProperty("key").GetString()!, v.GetProperty("unit").GetString()!];
    }

    [Theory]
    [MemberData(nameof(Vectors))]
    public void MatchesTheSharedTestVectors_ComputedIndependentlyOfThisLibrary(long seed, string layer, string fault, string key, string expected) =>
        Assert.Equal(double.Parse(expected, CultureInfo.InvariantCulture), ChaosDecider.Unit(seed, layer, fault, key));

    [Fact]
    public void SameInputs_GiveTheSameNumber_AndDifferentSeedsLayersFaultsOrKeysGiveDifferentOnes()
    {
        var baseline = ChaosDecider.Unit(1, "events", "drop", "k");
        Assert.Equal(baseline, ChaosDecider.Unit(1, "events", "drop", "k"));
        Assert.NotEqual(baseline, ChaosDecider.Unit(2, "events", "drop", "k"));
        Assert.NotEqual(baseline, ChaosDecider.Unit(1, "cache", "drop", "k"));
        Assert.NotEqual(baseline, ChaosDecider.Unit(1, "events", "reorder", "k"));
        Assert.NotEqual(baseline, ChaosDecider.Unit(1, "events", "drop", "j"));
    }

    [Fact]
    public void RateZeroNeverApplies_RateOneAlwaysApplies_AndOtherRatesLandNearTheirShare()
    {
        var keys = Enumerable.Range(0, 5000).Select(i => $"key-{i}").ToList();
        Assert.DoesNotContain(keys, k => ChaosDecider.Applies(7, "events", "drop", k, 0));
        Assert.All(keys, k => Assert.True(ChaosDecider.Applies(7, "events", "drop", k, 1)));
        var share = keys.Count(k => ChaosDecider.Applies(7, "events", "drop", k, 0.3)) / (double)keys.Count;
        Assert.InRange(share, 0.27, 0.33);
    }

    [Fact]
    public void DecisionsDoNotDependOnCallOrderOrThreads()
    {
        var keys = Enumerable.Range(0, 2000).Select(i => $"event-{i}").ToList();
        var sequential = keys.Select(k => ChaosDecider.Applies(99, "events", "publishFailure", k, 0.4)).ToArray();

        var parallel = new bool[keys.Count];
        Parallel.For(0, keys.Count, new ParallelOptions { MaxDegreeOfParallelism = 8 }, i =>
            parallel[i] = ChaosDecider.Applies(99, "events", "publishFailure", keys[keys.Count - 1 - (keys.Count - 1 - i)], 0.4));

        Assert.Equal(sequential, parallel);
    }
}

public sealed class ChaosScenarioTests
{
    [Theory]
    [InlineData("flaky-broker")]
    [InlineData("slow-cache")]
    public void TheCommittedScenarioFilesLoad(string name)
    {
        var scenario = ChaosScenario.Load(RepoChaos.Path($"scenarios/{name}.json"));
        Assert.Equal(name, scenario.Name);
        Assert.NotEmpty(scenario.Layers);
    }

    [Fact]
    public void TheLayersAndSettingsAreTheOnesInChaosLayersJson_WhichTheTypeScriptLibraryIsAlsoTestedAgainst()
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(RepoChaos.Path("layers.json")));
        var shared = doc.RootElement.GetProperty("layers").EnumerateObject()
            .ToDictionary(l => l.Name, l => l.Value.EnumerateArray().Select(s => s.GetString()!).Order(StringComparer.Ordinal).ToArray());
        var known = ChaosScenario.Known.ToDictionary(l => l.Key, l => l.Value.Order(StringComparer.Ordinal).ToArray());

        Assert.Equal(shared.Keys.Order(StringComparer.Ordinal), known.Keys.Order(StringComparer.Ordinal));
        foreach (var (layer, settings) in shared) Assert.Equal(settings, known[layer]);
    }

    [Theory]
    [InlineData(200)]
    [InlineData(600)]
    [InlineData(503.5)]
    public void ARejectStatusMustBeAWholeHttpErrorStatus(double status)
    {
        var e = Assert.Throws<ChaosScenarioException>(() =>
            ChaosScenario.Of("n", 1, "bff", ("rejectStatus", status)));
        Assert.Contains("from 400 to 599", e.Message);
    }

    [Fact]
    public void ReadsNameSeedAndLayerSettings()
    {
        var scenario = ChaosScenario.Parse("""{ "name": "n", "seed": 5, "layers": { "events": { "dropRate": 0.25, "latencyMs": 100 } } }""");
        Assert.Equal(5, scenario.Seed);
        Assert.True(scenario.HasLayer("events"));
        Assert.False(scenario.HasLayer("cache"));
        Assert.Equal(0.25, scenario.Get("events", "dropRate"));
        Assert.Equal(0, scenario.Get("events", "reorderRate")); // off unless set
    }

    [Theory]
    [InlineData("""{ "name": "n", "seed": 1, "layers": { "dispatch": { "latencyMs": 1 } } }""", "not built")]
    [InlineData("""{ "name": "n", "seed": 1, "layers": { "events": { "dropRat": 0.1 } } }""", "no setting")]
    [InlineData("""{ "name": "n", "seed": 1, "layers": { "events": { "dropRate": 1.5 } } }""", "between 0 and 1")]
    [InlineData("""{ "name": "n", "seed": 1, "layers": { "events": { "latencyMs": -1 } } }""", "0 or more")]
    [InlineData("""{ "name": "n", "layers": {} }""", "needs a seed")]
    [InlineData("""{ "seed": 1, "layers": {} }""", "needs a name")]
    [InlineData("""{ "name": "n", "seed": 1, "layer": {} }""", "Unexpected")]
    [InlineData("""{ "name": "n", "seed": 1.5, "layers": {} }""", "Unexpected")]
    [InlineData("""{ "name": "n", "seed": 1, "layers": { "events": { "dropRate": "high" } } }""", "must be a number")]
    [InlineData("not json", "not valid JSON")]
    public void AMistakeInAScenarioFailsLoudly_NotSilently(string json, string expectedFragment)
    {
        var e = Assert.Throws<ChaosScenarioException>(() => ChaosScenario.Parse(json));
        Assert.Contains(expectedFragment, e.Message);
    }
}

public sealed class ChaosGateAndJournalTests
{
    [Theory]
    [InlineData("Development", null, true)]
    [InlineData("development", null, true)]
    [InlineData("Production", "dev", true)] // the deployed dev stack runs as Production (infra/environments/dev)
    [InlineData("Production", null, false)]
    [InlineData("Production", "uat", false)]
    [InlineData("Production", "prod", false)]
    [InlineData("Staging", null, false)]
    public void ChaosRunsOnlyInDevelopmentAndTheDevDeployment(string host, string? deployment, bool allowed)
    {
        Assert.Equal(allowed, ChaosGate.IsAllowed(host, deployment));
        var scenario = ChaosScenario.Of("n", 1, "events", ("dropRate", 1));
        if (allowed) Assert.True(new ChaosRuntime(scenario, host, deployment).Enabled);
        else Assert.Throws<InvalidOperationException>(() => new ChaosRuntime(scenario, host, deployment));
    }

    [Fact]
    public void ADisabledRuntimeAnswersNoToEverything()
    {
        var layer = ChaosRuntime.Disabled.Layer("events");
        Assert.False(ChaosRuntime.Disabled.Enabled);
        Assert.False(layer.Active);
        Assert.False(layer.Inject("drop", "dropRate", "k"));
        Assert.False(layer.InOutage);
        Assert.Null(layer.Latency);
    }

    [Fact]
    public void InjectedFaultsAreJournaled_AndOnlyThoseThatApply()
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("n", 3, "events", ("dropRate", 0.5)));
        var layer = runtime.Layer("events");
        var applied = Enumerable.Range(0, 200).Count(i => layer.Inject("drop", "dropRate", $"k{i}"));

        Assert.InRange(applied, 60, 140);
        Assert.Equal(applied, runtime.Journal.Count("events", "drop"));
        Assert.Equal(applied, runtime.Journal.Summary()["events:drop"]);
        Assert.All(runtime.Journal.Entries, e => Assert.StartsWith("k", e.Key));
    }

    [Fact]
    public void TheOutageWindowOpensAndClosesOnTheScenarioClock()
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("n", 1, "events", ("outageFromSeconds", 0.15), ("outageWindowSeconds", 0.25)));
        var layer = runtime.Layer("events");
        Assert.False(layer.InOutage); // before it opens
        Thread.Sleep(220);
        Assert.True(layer.InOutage);
        Thread.Sleep(350);
        Assert.False(layer.InOutage); // recovered
    }

    [Fact]
    public async Task ARequestScopeCollectsOnlyTheFaultsInjectedInItsOwnFlow()
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("n", 1, "events", ("dropRate", 1), ("handlerFailureRate", 1)));
        var layer = runtime.Layer("events");

        async Task<IReadOnlyList<string>> Request(string fault, string setting)
        {
            using var scope = ChaosRequestScope.Begin();
            await Task.Delay(10);
            layer.Inject(fault, setting, "k");
            await Task.Delay(10);
            return scope.Faults;
        }

        var results = await Task.WhenAll(Request("drop", "dropRate"), Request("handlerFailure", "handlerFailureRate"));
        Assert.Equal(["events:drop"], results[0]);
        Assert.Equal(["events:handlerFailure"], results[1]);

        layer.Inject("drop", "dropRate", "outside"); // no request: in the journal, in no response
        Assert.Equal(3, runtime.Journal.Entries.Count);
    }
}
