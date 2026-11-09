using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// Where chaos may run (ADR-0024): local Development and the deployed dev stack only; UAT and Production refuse it. The deployed dev stack runs with
/// <c>ASPNETCORE_ENVIRONMENT=Production</c> (infra/environments/dev), so the host environment name alone cannot tell it from the real one: it is
/// identified by the separate setting <c>Deployment:Environment</c> = <c>dev</c>, which only the dev environment's configuration may set.
/// </summary>
public static class ChaosGate
{
    public const string DeploymentSetting = "Deployment:Environment";

    public static bool IsAllowed(string hostEnvironmentName, string? deploymentEnvironment) =>
        string.Equals(hostEnvironmentName, Environments.Development, StringComparison.OrdinalIgnoreCase)
        || string.Equals(deploymentEnvironment, "dev", StringComparison.OrdinalIgnoreCase);

    public static void Require(string hostEnvironmentName, string? deploymentEnvironment)
    {
        if (!IsAllowed(hostEnvironmentName, deploymentEnvironment))
            throw new InvalidOperationException(
                $"Chaos cannot run in host environment '{hostEnvironmentName}' / deployment '{deploymentEnvironment ?? "(none)"}'. " +
                "It is allowed only in Development and the dev deployment (ADR-0024); this is a hard safety gate, not a configuration oversight.");
    }
}

/// <summary>
/// The scenario that is on, its clock and its journal. Decorators ask it per operation; nothing in it is random. Outage windows are measured from
/// <see cref="Started"/>. <see cref="Disabled"/> is what a host without chaos holds: every question is answered "no".
/// </summary>
public sealed class ChaosRuntime
{
    public static readonly ChaosRuntime Disabled = new();

    private readonly TimeProvider _time;

    private ChaosRuntime()
    {
        _time = TimeProvider.System;
        Journal = new ChaosJournal(null, _time);
        Started = _time.GetUtcNow();
    }

    /// <param name="hostEnvironmentName">The host's environment name; checked with <paramref name="deploymentEnvironment"/> by <see cref="ChaosGate"/>.</param>
    public ChaosRuntime(ChaosScenario scenario, string hostEnvironmentName, string? deploymentEnvironment = null, ILogger? logger = null, TimeProvider? time = null)
    {
        ChaosGate.Require(hostEnvironmentName, deploymentEnvironment);
        Scenario = scenario ?? throw new ArgumentNullException(nameof(scenario));
        _time = time ?? TimeProvider.System;
        Journal = new ChaosJournal(logger, _time);
        Started = _time.GetUtcNow();
    }

    /// <summary>A runtime for tests, in the Development environment.</summary>
    public static ChaosRuntime ForTests(ChaosScenario scenario, TimeProvider? time = null) => new(scenario, Environments.Development, null, null, time);

    public bool Enabled => Scenario is not null;

    public ChaosScenario? Scenario { get; }

    public ChaosJournal Journal { get; }

    public DateTimeOffset Started { get; }

    internal TimeProvider Time => _time;

    public ChaosLayer Layer(string name) => new(this, name);
}

/// <summary>One layer of the scenario, as a decorator sees it.</summary>
public readonly struct ChaosLayer(ChaosRuntime runtime, string name)
{
    public bool Active => runtime.Scenario?.HasLayer(name) == true;

    public double Setting(string setting) => runtime.Scenario?.Get(name, setting) ?? 0;

    /// <summary>
    /// Decides, from the seed and <paramref name="key"/>, whether <paramref name="fault"/> applies to this operation at the rate given by
    /// <paramref name="setting"/>; when it does, it is written to the journal.
    /// </summary>
    public bool Inject(string fault, string setting, string key)
    {
        if (runtime.Scenario is null) return false;
        var rate = Setting(setting);
        if (!ChaosDecider.Applies(runtime.Scenario.Seed, name, fault, key, rate)) return false;
        runtime.Journal.Record(name, fault, key);
        return true;
    }

    /// <summary>The delay every operation of the layer takes, if the scenario sets one.</summary>
    public TimeSpan? Latency => Setting("latencyMs") is > 0 and var ms ? TimeSpan.FromMilliseconds(ms) : null;

    /// <summary>True while the scenario's outage window is open: from <c>outageFromSeconds</c> after the start, for <c>outageWindowSeconds</c>.</summary>
    public bool InOutage
    {
        get
        {
            var window = Setting("outageWindowSeconds");
            if (window <= 0) return false;
            var elapsed = (runtime.Time.GetUtcNow() - runtime.Started).TotalSeconds;
            var from = Setting("outageFromSeconds");
            return elapsed >= from && elapsed < from + window;
        }
    }

    public void Record(string fault, string key) => runtime.Journal.Record(name, fault, key);
}
