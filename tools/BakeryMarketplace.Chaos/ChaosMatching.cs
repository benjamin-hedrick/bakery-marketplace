using System.Text.Json;

namespace BakeryMarketplace.Chaos;

/// <summary>
/// One rule of a scenario's <c>where</c> or a signal's <c>when</c>: which calls it is about (ADR-0024 amendment of 2026-11-10; applied by the C# library
/// since WI-CHAOS-006). Every part that is given must hold. The same rules as <c>packages/chaos/src/match.ts</c>; <c>chaos/match-vectors.json</c> holds
/// cases both libraries' tests reproduce.
/// </summary>
public sealed record ChaosMatch(string? Client, string? Operation, string? Customer, string? Key, JsonElement? Payload)
{
    internal static ChaosMatch From(JsonElement e)
    {
        string? Text(string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return new ChaosMatch(Text("client"), Text("operation"), Text("customer"), Text("key"),
            e.TryGetProperty("payload", out var p) ? p.Clone() : null);
    }
}

/// <summary>A signal: a normal call that matches <see cref="When"/> runs <see cref="Do"/> (enable, disable, switch or reset).</summary>
public sealed record ChaosSignal(ChaosMatch When, string Do, string? Layer, string? Scenario);

/// <summary>
/// One call through a layer, as a rule sees it: the layer (the "client"), the operation, the call's own key (an id), the customer of the request it is
/// part of (the signed-in user's <c>sub</c>, when there is one), and the call's main argument. Never stored or logged.
/// </summary>
public readonly record struct ChaosCall(string Client, string Operation, string Key, string? Customer, object? Payload);

public static class ChaosMatching
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>True when every part the match gives holds for the call.</summary>
    public static bool Matches(ChaosMatch match, ChaosCall call)
    {
        if (match.Client is not null && match.Client != call.Client) return false;
        if (match.Operation is not null && match.Operation != call.Operation) return false;
        if (match.Customer is not null && match.Customer != call.Customer) return false;
        if (match.Key is not null && match.Key != call.Key) return false;
        if (match.Payload is { } pattern && !Contains(pattern, AsJson(call.Payload))) return false;
        return true;
    }

    /// <summary>The call's argument as JSON, with the web defaults (camelCase), as the Node processes see their arguments; null when there is none.</summary>
    internal static JsonElement? AsJson(object? payload) => payload switch
    {
        null => null,
        JsonElement e => e,
        _ => JsonSerializer.SerializeToElement(payload, payload.GetType(), Web),
    };

    /// <summary>
    /// True when <paramref name="value"/> contains everything <paramref name="pattern"/> names: equal scalars, objects with at least the pattern's
    /// properties, arrays of the same length element by element. A missing value (no such property, no argument: null here) contains nothing, as
    /// JavaScript's undefined equals nothing, not even a JSON null.
    /// </summary>
    public static bool Contains(JsonElement pattern, JsonElement? value)
    {
        if (value is not { } v) return false;
        switch (pattern.ValueKind)
        {
            case JsonValueKind.Array:
                if (v.ValueKind != JsonValueKind.Array || v.GetArrayLength() != pattern.GetArrayLength()) return false;
                using (var p = pattern.EnumerateArray().GetEnumerator())
                using (var x = v.EnumerateArray().GetEnumerator())
                    while (p.MoveNext() && x.MoveNext())
                        if (!Contains(p.Current, x.Current)) return false;
                return true;
            case JsonValueKind.Object:
                if (v.ValueKind != JsonValueKind.Object) return false;
                foreach (var property in pattern.EnumerateObject())
                    if (!Contains(property.Value, v.TryGetProperty(property.Name, out var inner) ? inner : null)) return false;
                return true;
            case JsonValueKind.String:
                return v.ValueKind == JsonValueKind.String && v.GetString() == pattern.GetString();
            case JsonValueKind.Number:
                return v.ValueKind == JsonValueKind.Number && v.GetDouble() == pattern.GetDouble();
            case JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null:
                return v.ValueKind == pattern.ValueKind;
            default:
                return false;
        }
    }
}
