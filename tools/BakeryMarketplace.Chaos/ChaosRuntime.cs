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

    private readonly Func<string, ChaosScenario>? _resolve;
    private readonly Func<string?> _customer;
    private readonly object _switchLock = new();
    private volatile ChaosScenario? _scenario;
    private volatile State _state;

    /// <summary>What a signal changes, swapped as a whole so a reader never sees half of it: the layers switched off and the start of the clock.</summary>
    private sealed record State(IReadOnlySet<string> Off, DateTimeOffset Started);

    private ChaosRuntime()
    {
        _time = TimeProvider.System;
        _customer = () => null;
        Journal = new ChaosJournal(null, _time);
        _state = new State(new HashSet<string>(), _time.GetUtcNow());
    }

    /// <param name="hostEnvironmentName">The host's environment name; checked with <paramref name="deploymentEnvironment"/> by <see cref="ChaosGate"/>.</param>
    /// <param name="resolveScenario">Finds the scenario a <c>switch</c> signal names; without it a switch fails.</param>
    /// <param name="currentCustomer">The signed-in user (<c>sub</c>) of the request being served, if any, for a rule's <c>customer</c>.</param>
    public ChaosRuntime(
        ChaosScenario scenario, string hostEnvironmentName, string? deploymentEnvironment = null, ILogger? logger = null, TimeProvider? time = null,
        Func<string, ChaosScenario>? resolveScenario = null, Func<string?>? currentCustomer = null)
    {
        ChaosGate.Require(hostEnvironmentName, deploymentEnvironment);
        _scenario = scenario ?? throw new ArgumentNullException(nameof(scenario));
        _time = time ?? TimeProvider.System;
        _resolve = resolveScenario;
        _customer = currentCustomer ?? (() => null);
        Journal = new ChaosJournal(logger, _time);
        _state = new State(scenario.Off.ToHashSet(StringComparer.Ordinal), _time.GetUtcNow());
    }

    /// <summary>A runtime for tests, in the Development environment.</summary>
    public static ChaosRuntime ForTests(
        ChaosScenario scenario, TimeProvider? time = null, Func<string, ChaosScenario>? resolveScenario = null, Func<string?>? currentCustomer = null) =>
        new(scenario, Environments.Development, null, null, time, resolveScenario, currentCustomer);

    public bool Enabled => _scenario is not null;

    /// <summary>The scenario that is on now; a <c>switch</c> signal replaces it.</summary>
    public ChaosScenario? Scenario => _scenario;

    public ChaosJournal Journal { get; }

    /// <summary>When the scenario's clock started (the runtime's creation, or the last reset or switch); outage windows are measured from it.</summary>
    public DateTimeOffset Started => _state.Started;

    internal TimeProvider Time => _time;

    /// <summary>The signed-in user of the request being served, or null (background work, an anonymous request).</summary>
    internal string? CurrentCustomer => _customer();

    /// <summary>True when a layer is in the scenario that is on and not switched off.</summary>
    public bool IsOn(string layer) => _scenario?.HasLayer(layer) == true && !_state.Off.Contains(layer);

    /// <summary>Whether a layer disturbs this call: it has no <c>where</c>, or the call matches one of its rules.</summary>
    public bool AppliesTo(string layer, ChaosCall call) =>
        _scenario is not { } s || !s.Where.TryGetValue(layer, out var rules) || rules.Any(r => ChaosMatching.Matches(r, call));

    /// <summary>
    /// Runs the scenario's signals that match this call, in order, and returns what they did (each also in the journal as <c>signal</c>, with the call's
    /// key). The call itself goes on as normal and is judged after the signals, as in <c>packages/chaos</c>.
    /// </summary>
    public IReadOnlyList<string> Signal(ChaosCall call)
    {
        if (_scenario is not { Signals.Count: > 0 } scenario) return [];
        var done = new List<string>();
        foreach (var signal in scenario.Signals)
        {
            if (!ChaosMatching.Matches(signal.When, call)) continue;
            string what;
            lock (_switchLock)
            {
                switch (signal.Do)
                {
                    case "enable":
                        _state = _state with { Off = _state.Off.Where(l => l != signal.Layer).ToHashSet(StringComparer.Ordinal) };
                        what = $"enable:{signal.Layer}";
                        break;
                    case "disable":
                        _state = _state with { Off = _state.Off.Append(signal.Layer!).ToHashSet(StringComparer.Ordinal) };
                        what = $"disable:{signal.Layer}";
                        break;
                    case "reset":
                        Restart(_scenario!);
                        what = "reset";
                        break;
                    default: // switch (the scenario's own check allows nothing else)
                        if (_resolve is null)
                            throw new ChaosScenarioException($"Scenario '{scenario.Name}' has a switch signal but nothing can find scenarios.");
                        Restart(_resolve(signal.Scenario!));
                        what = $"switch:{signal.Scenario}";
                        break;
                }
            }

            Journal.Record("signal", what, call.Key);
            done.Add(what);
        }

        return done;
    }

    /// <summary>Starts the counters and the clock again with <paramref name="scenario"/> (this one for a reset), its layers as it starts them.</summary>
    private void Restart(ChaosScenario scenario)
    {
        _scenario = scenario;
        _attempts.Clear();
        _state = new State(scenario.Off.ToHashSet(StringComparer.Ordinal), _time.GetUtcNow());
    }

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, int> _attempts = new();

    /// <summary>The n-th time this process has seen this operation and key for this fault (1 the first time).</summary>
    internal int NextAttempt(string layer, string fault, string operationKey) =>
        _attempts.AddOrUpdate($"{layer}|{fault}|{operationKey}", 1, (_, n) => n + 1);

    public ChaosLayer Layer(string name) => new(this, name);
}

/// <summary>One layer of the scenario, as a decorator sees it.</summary>
public readonly struct ChaosLayer(ChaosRuntime runtime, string name)
{
    /// <summary>True when the layer is in the scenario that is on and not switched off.</summary>
    public bool Active => runtime.IsOn(name);

    /// <summary>In the scenario at all, whether or not it is switched off now (a signal may turn it on).</summary>
    public bool Declared => runtime.Scenario?.HasLayer(name) == true;

    /// <summary>
    /// The first thing a decorator asks for each call: runs the signals the call matches, then answers whether this layer disturbs it (on, and aimed at
    /// it by <c>where</c>, if the layer has one). When it answers false the decorator passes the call through untouched. <paramref name="payload"/>
    /// is the call's main argument (a request, an entity, an event), matched as JSON; the customer is the signed-in user of the current request.
    /// </summary>
    public bool Disturbs(string operation, string key, object? payload = null)
    {
        if (runtime.Scenario is null) return false;
        var call = new ChaosCall(name, operation, key, runtime.CurrentCustomer, payload);
        runtime.Signal(call);
        return runtime.IsOn(name) && runtime.AppliesTo(name, call);
    }

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

    /// <summary>The runtime's clock: the latency waits and the outage window both run on it.</summary>
    internal TimeProvider Time => runtime.Time;

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

    /// <summary>
    /// What most layers do before the real call: wait (<c>latencyMs</c>), fail during the outage window, and fail at the rate given by
    /// <paramref name="setting"/>, throwing <paramref name="failure"/>'s exception. The random failure is keyed by the operation, its key and the
    /// attempt number of that operation and key (kept in the runtime), so a rerun of the scenario fails the same calls and a retry is judged afresh.
    /// </summary>
    public async Task BeforeAsync(string operation, string key, string fault, string setting, Func<Exception> failure, CancellationToken ct)
    {
        var opKey = $"{operation}:{key}";
        if (Latency is { } delay)
        {
            // The timer before the journal entry, so a test that sees the entry cannot advance its manual clock before the timer exists (register 207).
            var wait = Task.Delay(delay, runtime.Time, ct);
            Record("latency", opKey);
            await wait;
        }

        if (InOutage)
        {
            Record("outage", opKey);
            throw failure();
        }

        if (Setting(setting) > 0 && Inject(fault, setting, $"{opKey}:{runtime.NextAttempt(name, fault, opKey)}"))
            throw failure();
    }

    /// <summary>
    /// The ambiguous failure: the operation <b>succeeded</b> but the caller never hears (a timeout after the work was done). Call it after the real call
    /// and throw when it returns true. Decided by <c>lostResponseRate</c>, keyed like every other failure. A caller that retries must be idempotent.
    /// </summary>
    public bool LostResponse(string operation, string key) => InjectAttempt(operation, key, "lostResponse", "lostResponseRate");

    /// <summary>Decides a fault for an operation and key, with the attempt number of that operation and key (so a retry gets a fresh decision).</summary>
    public bool InjectAttempt(string operation, string key, string fault, string setting)
    {
        if (Setting(setting) <= 0) return false;
        var opKey = $"{operation}:{key}";
        return Inject(fault, setting, $"{opKey}:{runtime.NextAttempt(name, fault, opKey)}");
    }
}
