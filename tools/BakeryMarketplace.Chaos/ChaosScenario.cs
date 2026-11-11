using System.Text.Json;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// A named, seeded set of faults per layer (ADR-0024). It is data: a JSON file in <c>chaos/scenarios/</c>, read by the C# services and the
/// TypeScript processes alike. Every layer and setting name is checked against <see cref="Known"/>, so a typo or a layer that is not built yet
/// fails at startup instead of silently doing nothing.
/// <code>{ "name": "flaky-broker", "seed": 20261109, "layers": { "events": { "publishFailureRate": 0.3, "latencyMs": 100 } } }</code>
/// Settings ending in <c>Rate</c> are probabilities (0 to 1); the others are non-negative numbers (milliseconds or seconds, as named).
/// </summary>
public sealed class ChaosScenario
{
    /// <summary>The layers that exist and the settings each accepts.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> Known = new Dictionary<string, IReadOnlySet<string>>
    {
        ["events"] = new HashSet<string>
        {
            "publishFailureRate", "publishLostResponseRate", "dropRate", "duplicateRate", "reorderRate", "handlerFailureRate",
            "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["cache"] = new HashSet<string>
        {
            "failureRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // A transient store error (a Cosmos 503), an optimistic-concurrency conflict on a conditional save or batch, and slowness.
        ["repository"] = new HashSet<string>
        {
            "failureRate", "lostResponseRate", "conflictRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The Pub/Sub nudge to the live vendor screens: a failed publish, a lost one, a lost delivery, slowness.
        ["broadcast"] = new HashSet<string>
        {
            "failureRate", "dropRate", "deliveryDropRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The payment processor seam in ordering: the processor failing, declining, or answering slowly.
        ["payment"] = new HashSet<string>
        {
            "failureRate", "lostResponseRate", "declineRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // Ordering's gateway to the catalog: unreachable, a refused reservation, slowness.
        ["catalog"] = new HashSet<string>
        {
            "unavailableRate", "lostResponseRate", "rejectRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The notification service's sender: a delivery that fails, slowness.
        ["contacts"] = new HashSet<string>
        {
            "failureRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["notification"] = new HashSet<string>
        {
            "failureRate", "lostResponseRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The layers of the Node processes (the GraphQL BFF: its door and its two service clients). The C# services have nothing to wrap for them and report
        // them as not applicable; they are accepted here so one scenario file can serve the whole stack. chaos/layers.json is the shared list.
        ["bff"] = new HashSet<string>
        {
            "rejectRate", "rejectStatus", "malformedRate", "resetRate", "hangRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["web"] = new HashSet<string>
        {
            "rejectRate", "rejectStatus", "malformedRate", "resetRate", "hangRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["bffCatalog"] = new HashSet<string>
        {
            "failFirstAttempts", "unavailableRate", "serverErrorRate", "malformedRate", "lostResponseRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["bffOrdering"] = new HashSet<string>
        {
            "failFirstAttempts", "unavailableRate", "serverErrorRate", "malformedRate", "lostResponseRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
    };

    /// <summary>What a signal can do (a copy of <c>signalActions</c> in <c>chaos/layers.json</c>, checked by the tests).</summary>
    public static readonly IReadOnlySet<string> SignalActions = new HashSet<string> { "enable", "disable", "switch", "reset" };

    /// <summary>The optional sections of a file besides name, seed and layers (a copy of <c>sections</c> in <c>chaos/layers.json</c>).</summary>
    public static readonly IReadOnlySet<string> Sections = new HashSet<string> { "where", "off", "signals" };

    private static readonly string[] MatchKeys = ["client", "operation", "customer", "key", "payload"];

    public string Name { get; }

    public long Seed { get; }

    public IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> Layers { get; }

    public ChaosScenario(string name, long seed, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> layers)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ChaosScenarioException("A scenario needs a name.");
        Name = name;
        Seed = seed;
        foreach (var (layer, settings) in layers)
        {
            if (!Known.TryGetValue(layer, out var allowed))
                throw new ChaosScenarioException($"Scenario '{name}': layer '{layer}' is not built. Known layers: {string.Join(", ", Known.Keys)}.");
            foreach (var (setting, value) in settings)
            {
                if (!allowed.Contains(setting))
                    throw new ChaosScenarioException($"Scenario '{name}': layer '{layer}' has no setting '{setting}'. Known: {string.Join(", ", allowed.Order())}.");
                if (double.IsNaN(value) || value < 0 || (setting.EndsWith("Rate", StringComparison.Ordinal) && value > 1))
                    throw new ChaosScenarioException($"Scenario '{name}': {layer}.{setting} must be {(setting.EndsWith("Rate", StringComparison.Ordinal) ? "between 0 and 1" : "0 or more")}, not {value}.");
                if (setting == "failFirstAttempts" && value != Math.Floor(value))
                    throw new ChaosScenarioException($"Scenario '{name}': {layer}.{setting} must be a whole number, not {value}.");
                if (setting == "rejectStatus" && (value != Math.Floor(value) || value < 400 || value > 599))
                    throw new ChaosScenarioException($"Scenario '{name}': {layer}.{setting} must be a whole HTTP status from 400 to 599, not {value}.");
            }
        }

        Layers = layers;
    }

    public bool HasLayer(string layer) => Layers.ContainsKey(layer);

    /// <summary>A setting's value, or 0 (off) when the layer or setting is not in the scenario.</summary>
    public double Get(string layer, string setting) =>
        Layers.TryGetValue(layer, out var settings) && settings.TryGetValue(setting, out var value) ? value : 0;

    /// <summary>A one-layer scenario, for tests and small programs.</summary>
    public static ChaosScenario Of(string name, long seed, string layer, params (string Setting, double Value)[] settings) =>
        new(name, seed, new Dictionary<string, IReadOnlyDictionary<string, double>>
        {
            [layer] = settings.ToDictionary(s => s.Setting, s => s.Value),
        });

    public static ChaosScenario Parse(string json)
    {
        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(json, new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip });
        }
        catch (JsonException e)
        {
            throw new ChaosScenarioException($"The scenario is not valid JSON: {e.Message}");
        }

        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new ChaosScenarioException("A scenario must be a JSON object.");
            string? name = null;
            long? seed = null;
            var layers = new Dictionary<string, IReadOnlyDictionary<string, double>>();
            var sections = new Dictionary<string, JsonElement>();
            foreach (var property in doc.RootElement.EnumerateObject())
            {
                switch (property.Name)
                {
                    case "name" when property.Value.ValueKind == JsonValueKind.String:
                        name = property.Value.GetString();
                        break;
                    case "seed" when property.Value.ValueKind == JsonValueKind.Number && property.Value.TryGetInt64(out var s):
                        seed = s;
                        break;
                    case "layers" when property.Value.ValueKind == JsonValueKind.Object:
                        foreach (var layer in property.Value.EnumerateObject())
                        {
                            if (layer.Value.ValueKind != JsonValueKind.Object) throw new ChaosScenarioException($"Layer '{layer.Name}' must be an object of settings.");
                            var settings = new Dictionary<string, double>();
                            foreach (var setting in layer.Value.EnumerateObject())
                            {
                                if (setting.Value.ValueKind != JsonValueKind.Number) throw new ChaosScenarioException($"{layer.Name}.{setting.Name} must be a number.");
                                settings[setting.Name] = setting.Value.GetDouble();
                            }

                            layers[layer.Name] = settings;
                        }

                        break;
                    case "where" or "off" or "signals":
                        sections[property.Name] = property.Value.Clone();
                        break;
                    default:
                        throw new ChaosScenarioException(
                            $"Unexpected or mistyped property '{property.Name}' (a scenario has name, seed, layers and, optionally, {string.Join(", ", Sections.Order())}).");
                }
            }

            if (name is null) throw new ChaosScenarioException("A scenario needs a name.");
            if (seed is null) throw new ChaosScenarioException($"Scenario '{name}' needs a seed (a whole number).");
            var scenario = new ChaosScenario(name, seed.Value, layers);
            CheckSections(name, layers, sections);
            return scenario;
        }
    }

    // The where, off and signals sections are applied by the Node processes (the BFF's service clients). The C# services have no such client, so they
    // only check the sections, with the same rules as packages/chaos, so one scenario file is valid for the whole stack or for none of it.
    private static void CheckSections(string name, IReadOnlyDictionary<string, IReadOnlyDictionary<string, double>> layers, Dictionary<string, JsonElement> sections)
    {
        void Present(string layer, string at)
        {
            if (!Known.ContainsKey(layer)) throw new ChaosScenarioException($"Scenario '{name}': {at} names layer '{layer}', which is not built.");
            if (!layers.ContainsKey(layer)) throw new ChaosScenarioException($"Scenario '{name}': {at} names layer '{layer}', which the scenario does not have.");
        }

        void Match(JsonElement match, string at)
        {
            if (match.ValueKind != JsonValueKind.Object) throw new ChaosScenarioException($"Scenario '{name}': {at} must be an object ({string.Join(", ", MatchKeys)}).");
            var any = false;
            foreach (var p in match.EnumerateObject())
            {
                any = true;
                if (!MatchKeys.Contains(p.Name)) throw new ChaosScenarioException($"Scenario '{name}': {at} has no property '{p.Name}'. Known: {string.Join(", ", MatchKeys)}.");
                if (p.Name == "client" && p.Value.ValueKind == JsonValueKind.String && !Known.ContainsKey(p.Value.GetString()!))
                    throw new ChaosScenarioException($"Scenario '{name}': {at}.client names layer '{p.Value.GetString()}', which is not built.");
                if (p.Name != "payload" && (p.Value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(p.Value.GetString())))
                    throw new ChaosScenarioException($"Scenario '{name}': {at}.{p.Name} must be a non-empty string.");
            }

            if (!any) throw new ChaosScenarioException($"Scenario '{name}': {at} matches everything; leave it out instead.");
        }

        if (sections.TryGetValue("where", out var where))
        {
            if (where.ValueKind != JsonValueKind.Object) throw new ChaosScenarioException($"Scenario '{name}': where must be an object of layers.");
            foreach (var layer in where.EnumerateObject())
            {
                Present(layer.Name, "where");
                if (layer.Value.ValueKind != JsonValueKind.Array || layer.Value.GetArrayLength() == 0)
                    throw new ChaosScenarioException($"Scenario '{name}': where.{layer.Name} must be a list of matches.");
                var i = 0;
                foreach (var m in layer.Value.EnumerateArray()) Match(m, $"where.{layer.Name}[{i++}]");
            }
        }

        if (sections.TryGetValue("off", out var off))
        {
            if (off.ValueKind != JsonValueKind.Array) throw new ChaosScenarioException($"Scenario '{name}': off must be a list of layers.");
            foreach (var layer in off.EnumerateArray())
            {
                if (layer.ValueKind != JsonValueKind.String) throw new ChaosScenarioException($"Scenario '{name}': off must be a list of layers.");
                Present(layer.GetString()!, "off");
            }
        }

        if (sections.TryGetValue("signals", out var signals))
        {
            if (signals.ValueKind != JsonValueKind.Array) throw new ChaosScenarioException($"Scenario '{name}': signals must be a list.");
            var i = 0;
            foreach (var signal in signals.EnumerateArray())
            {
                var at = $"signals[{i++}]";
                if (signal.ValueKind != JsonValueKind.Object) throw new ChaosScenarioException($"Scenario '{name}': {at} must be an object.");
                string? action = null, layer = null, scenario = null;
                JsonElement? when = null;
                foreach (var p in signal.EnumerateObject())
                {
                    switch (p.Name)
                    {
                        case "do": action = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : null; break;
                        case "layer": layer = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : ""; break;
                        case "scenario": scenario = p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : ""; break;
                        case "when": when = p.Value; break;
                        default: throw new ChaosScenarioException($"Scenario '{name}': {at} has no property '{p.Name}' (do, layer, scenario, when).");
                    }
                }

                if (action is null || !SignalActions.Contains(action))
                    throw new ChaosScenarioException($"Scenario '{name}': {at}.do '{action}' is not an action. Known: {string.Join(", ", SignalActions.Order())}.");
                if (when is null) throw new ChaosScenarioException($"Scenario '{name}': {at}.when must be an object (client, operation, customer, key, payload).");
                Match(when.Value, $"{at}.when");
                if (action is "enable" or "disable")
                {
                    if (layer is null) throw new ChaosScenarioException($"Scenario '{name}': {at} ({action}) needs a layer.");
                    Present(layer, at);
                }
                else if (layer is not null) throw new ChaosScenarioException($"Scenario '{name}': {at} ({action}) takes no layer.");

                if (action == "switch")
                {
                    if (scenario is null || !System.Text.RegularExpressions.Regex.IsMatch(scenario, "^[A-Za-z0-9][A-Za-z0-9_-]*$"))
                        throw new ChaosScenarioException($"Scenario '{name}': {at} (switch) needs the plain name of a scenario file, not a path.");
                }
                else if (scenario is not null) throw new ChaosScenarioException($"Scenario '{name}': {at} ({action}) takes no scenario.");
            }
        }
    }

    public static ChaosScenario Load(string path) => Parse(File.ReadAllText(path));
}

public sealed class ChaosScenarioException(string message) : Exception(message);
