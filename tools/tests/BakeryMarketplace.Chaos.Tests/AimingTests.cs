using System.Text.Json;

namespace BakeryMarketplace.Chaos.Tests;

/// <summary>
/// Aiming in the C# library (WI-CHAOS-006): <c>where</c>, <c>off</c> and <c>signals</c> are applied, not only checked. The shared cases in
/// <c>chaos/match-vectors.json</c> are reproduced here and by <c>packages/chaos/tests/match-vectors.test.ts</c>, so one scenario aims the same way in
/// the services and the Node processes.
/// </summary>
public sealed class AimingTests
{
    private static JsonDocument Vectors() => JsonDocument.Parse(File.ReadAllText(RepoChaos.Path("match-vectors.json")));

    private static ChaosCall CallOf(JsonElement c) => new(
        c.GetProperty("client").GetString()!,
        c.GetProperty("operation").GetString()!,
        c.GetProperty("key").GetString()!,
        c.TryGetProperty("customer", out var customer) ? customer.GetString() : null,
        c.TryGetProperty("payload", out var payload) ? payload.Clone() : null);

    [Fact]
    public void Contains_ReproducesTheSharedCases()
    {
        using var doc = Vectors();
        var i = 0;
        foreach (var v in doc.RootElement.GetProperty("contains").EnumerateArray())
        {
            JsonElement? value = v.TryGetProperty("value", out var x) ? x : null;
            Assert.True(v.GetProperty("expected").GetBoolean() == ChaosMatching.Contains(v.GetProperty("pattern"), value), $"contains[{i}]");
            i++;
        }
    }

    [Fact]
    public void Matches_ReproducesTheSharedCases()
    {
        using var doc = Vectors();
        var i = 0;
        foreach (var v in doc.RootElement.GetProperty("matches").EnumerateArray())
        {
            var match = ChaosScenario.Parse(JsonSerializer.Serialize(new
            {
                name = "m",
                seed = 1,
                layers = new Dictionary<string, object> { ["payment"] = new { }, ["catalog"] = new { } },
                where = new Dictionary<string, object> { ["payment"] = new[] { v.GetProperty("match") } },
            })).Where["payment"][0];
            Assert.True(v.GetProperty("expected").GetBoolean() == ChaosMatching.Matches(match, CallOf(v.GetProperty("call"))), $"matches[{i}]");
            i++;
        }
    }

    public static IEnumerable<object[]> Runs()
    {
        using var doc = Vectors();
        foreach (var run in doc.RootElement.GetProperty("runs").EnumerateArray())
            yield return [run.GetProperty("name").GetString()!, run.GetRawText()];
    }

    [Theory]
    [MemberData(nameof(Runs))]
    public void ARun_ReproducesTheSharedCase(string name, string runJson)
    {
        using var run = JsonDocument.Parse(runJson);
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Parse(run.RootElement.GetProperty("scenario").GetRawText()));
        var i = 0;
        foreach (var step in run.RootElement.GetProperty("steps").EnumerateArray())
        {
            var call = CallOf(step.GetProperty("call"));
            var expectedSignals = step.GetProperty("signals").EnumerateArray().Select(s => s.GetString()!).ToArray();
            Assert.Equal(expectedSignals, runtime.Signal(call));
            Assert.True(step.GetProperty("disturbs").GetBoolean() == (runtime.IsOn(call.Client) && runtime.AppliesTo(call.Client, call)), $"{name}: step {i}");
            i++;
        }
    }

    [Fact]
    public void ALayer_PassesThroughWhatItIsNotAimedAt_AndDisturbsWhatItIs_ThroughDisturbs()
    {
        var customer = "user-a";
        var scenario = ChaosScenario.Parse("""
            { "name": "aimed", "seed": 1, "layers": { "payment": { "declineRate": 1 } }, "where": { "payment": [ { "customer": "user-chaos" } ] } }
            """);
        var runtime = ChaosRuntime.ForTests(scenario, currentCustomer: () => customer);
        var layer = runtime.Layer("payment");
        Assert.False(layer.Disturbs("authorize", "o-1"));
        customer = "user-chaos";
        Assert.True(layer.Disturbs("authorize", "o-2"));
        Assert.True(layer.InjectAttempt("authorize", "o-2", "decline", "declineRate"));
    }

    [Fact]
    public void APayloadRule_MatchesACSharpObject_AsCamelCaseJson()
    {
        var scenario = ChaosScenario.Parse("""
            { "name": "by-payload", "seed": 1, "layers": { "payment": { "declineRate": 1 } },
              "where": { "payment": [ { "payload": { "paymentMethodId": "pm-chaos-decline" } } ] } }
            """);
        var layer = ChaosRuntime.ForTests(scenario).Layer("payment");
        Assert.True(layer.Disturbs("authorize", "o-1", new { OrderId = "o-1", PaymentMethodId = "pm-chaos-decline", Amount = 5m }));
        Assert.False(layer.Disturbs("authorize", "o-2", new { OrderId = "o-2", PaymentMethodId = "pm-alice-ok", Amount = 5m }));
    }

    [Fact]
    public void ASignal_IsInTheJournal_AndAScenarioWithoutSectionsDisturbsEveryCallAsBefore()
    {
        var aimed = ChaosRuntime.ForTests(ChaosScenario.Parse("""
            { "name": "s", "seed": 1, "layers": { "catalog": { "unavailableRate": 1 } }, "off": [ "catalog" ],
              "signals": [ { "when": { "key": "listing-chaos-outage" }, "do": "enable", "layer": "catalog" } ] }
            """));
        Assert.False(aimed.Layer("catalog").Disturbs("getListing", "listing-x"));
        Assert.True(aimed.Layer("catalog").Disturbs("getListing", "listing-chaos-outage"));
        Assert.Equal(1, aimed.Journal.Count("signal", "enable:catalog"));

        var plain = ChaosRuntime.ForTests(ChaosScenario.Of("plain", 1, "catalog", ("unavailableRate", 1)));
        Assert.True(plain.Layer("catalog").Disturbs("getListing", "anything"));
        Assert.False(plain.Layer("payment").Disturbs("authorize", "o-1")); // not in the scenario
        Assert.False(ChaosRuntime.Disabled.Layer("catalog").Disturbs("getListing", "x"));
    }

    [Fact]
    public void ASwitch_ReplacesTheScenario_AndAScenarioThatCanSwitchWrapsEveryLayer()
    {
        var next = ChaosScenario.Of("next", 2, "payment", ("declineRate", 1));
        var first = ChaosScenario.Parse("""
            { "name": "first", "seed": 1, "layers": { "catalog": { "unavailableRate": 1 } },
              "signals": [ { "when": { "key": "go" }, "do": "switch", "scenario": "next" } ] }
            """);
        var runtime = ChaosRuntime.ForTests(first, resolveScenario: name => name == "next" ? next : throw new FileNotFoundException(name));
        Assert.True(new ChaosPlan(first).Wants("payment"));
        Assert.False(runtime.Layer("payment").Disturbs("authorize", "o-1"));
        Assert.Equal(["switch:next"], runtime.Signal(new ChaosCall("catalog", "getListing", "go", null, null)));
        Assert.Equal("next", runtime.Scenario!.Name);
        Assert.True(runtime.Layer("payment").Disturbs("authorize", "o-1"));
        Assert.False(new ChaosPlan(ChaosScenario.Of("plain", 1, "catalog", ("unavailableRate", 1))).Wants("payment"));
    }
}
