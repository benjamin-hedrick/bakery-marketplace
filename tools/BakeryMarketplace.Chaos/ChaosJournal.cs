using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace BakeryMarketplace.Chaos;

/// <summary>One injected fault: where, what, on which operation, when, and the trace it happened in (ADR-0016) so the journals of several processes can be joined.</summary>
public sealed record ChaosJournalEntry(DateTimeOffset At, string Layer, string Fault, string Key, string? TraceId);

/// <summary>
/// The record of every fault a scenario injected (ADR-0024). Each entry is also written as one log line and added to the request being served, if
/// any, for the response indicator. A scenario test asserts the journal shows the fault happened <b>before</b> it asserts the system coped.
/// There is deliberately no endpoint that reads it.
/// </summary>
public sealed class ChaosJournal(ILogger? logger = null, TimeProvider? time = null)
{
    private readonly ConcurrentQueue<ChaosJournalEntry> _entries = new();
    private readonly TimeProvider _time = time ?? TimeProvider.System;

    public IReadOnlyList<ChaosJournalEntry> Entries => _entries.ToArray();

    public int Count(string layer, string fault) => _entries.Count(e => e.Layer == layer && e.Fault == fault);

    public int Count(string layer) => _entries.Count(e => e.Layer == layer);

    /// <summary>Counts per "layer:fault", for the summary that is kept as evidence of a run.</summary>
    public IReadOnlyDictionary<string, int> Summary() =>
        _entries.GroupBy(e => $"{e.Layer}:{e.Fault}").OrderBy(g => g.Key, StringComparer.Ordinal).ToDictionary(g => g.Key, g => g.Count());

    internal void Record(string layer, string fault, string key)
    {
        var traceId = Activity.Current?.TraceId.ToString();
        _entries.Enqueue(new ChaosJournalEntry(_time.GetUtcNow(), layer, fault, key, traceId));
        ChaosRequestScope.Add($"{layer}:{fault}");
        if (logger is not null) ChaosLog.Injected(logger, layer, fault, key, traceId);
    }
}

/// <summary>The faults injected while one request was being served, collected through the async flow so the response can say so. Work outside a request has none.</summary>
public sealed class ChaosRequestScope : IDisposable
{
    private static readonly AsyncLocal<ChaosRequestScope?> Current = new();

    private readonly HashSet<string> _faults = [];
    private readonly ChaosRequestScope? _previous;

    private ChaosRequestScope()
    {
        _previous = Current.Value;
        Current.Value = this;
    }

    public static ChaosRequestScope Begin() => new();

    /// <summary>The distinct "layer:fault" names so far, sorted.</summary>
    public IReadOnlyList<string> Faults
    {
        get
        {
            lock (_faults) return _faults.Order(StringComparer.Ordinal).ToArray();
        }
    }

    internal static void Add(string fault)
    {
        var scope = Current.Value;
        if (scope is null) return;
        lock (scope._faults) scope._faults.Add(fault);
    }

    public void Dispose() => Current.Value = _previous;
}

internal static partial class ChaosLog
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "chaos injected: layer={Layer} fault={Fault} key={Key} trace={TraceId}")]
    public static partial void Injected(ILogger logger, string layer, string fault, string key, string? traceId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "CHAOS SCENARIO '{Scenario}' IS ON (seed {Seed}, layers {Layers}). Faults are injected on purpose; responses carry X-Chaos-Scenario.")]
    public static partial void ScenarioOn(ILogger logger, string scenario, long seed, string layers);
}
