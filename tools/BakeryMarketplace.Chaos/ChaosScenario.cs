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
            "publishFailureRate", "dropRate", "duplicateRate", "reorderRate", "handlerFailureRate",
            "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        ["cache"] = new HashSet<string>
        {
            "failureRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // A transient store error (a Cosmos 503), an optimistic-concurrency conflict on a conditional save or batch, and slowness.
        ["repository"] = new HashSet<string>
        {
            "failureRate", "conflictRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The Pub/Sub nudge to the live vendor screens: a failed publish, a lost one, a lost delivery, slowness.
        ["broadcast"] = new HashSet<string>
        {
            "failureRate", "dropRate", "deliveryDropRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The payment processor seam in ordering: the processor failing, declining, or answering slowly.
        ["payment"] = new HashSet<string>
        {
            "failureRate", "declineRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // Ordering's gateway to the catalog: unreachable, a refused reservation, slowness.
        ["catalog"] = new HashSet<string>
        {
            "unavailableRate", "rejectRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
        // The notification service's sender: a delivery that fails, slowness.
        ["notification"] = new HashSet<string>
        {
            "failureRate", "latencyMs", "outageFromSeconds", "outageWindowSeconds",
        },
    };

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
                    default:
                        throw new ChaosScenarioException($"Unexpected or mistyped property '{property.Name}' (a scenario has name, seed and layers).");
                }
            }

            if (name is null) throw new ChaosScenarioException("A scenario needs a name.");
            if (seed is null) throw new ChaosScenarioException($"Scenario '{name}' needs a seed (a whole number).");
            return new ChaosScenario(name, seed.Value, layers);
        }
    }

    public static ChaosScenario Load(string path) => Parse(File.ReadAllText(path));
}

public sealed class ChaosScenarioException(string message) : Exception(message);
