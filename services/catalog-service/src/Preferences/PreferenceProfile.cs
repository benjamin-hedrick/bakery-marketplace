using Newtonsoft.Json;

namespace CatalogService.Preferences;

/// <summary>
/// A customer's allergen profile as stored in the <c>preferences</c> container, partitioned by <c>customerId</c> (ADR-0004). The lists hold allergen
/// ids of the tag registry (ADR-0022). It is quasi-health data (NFR 3.7): read and written only by its owner, never logged, traced, cached or
/// published as an event.
/// </summary>
public sealed class PreferenceProfileDocument
{
    /// <summary>The customer id: one profile per customer, so the id is the partition key's value too.</summary>
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("customerId")] public string CustomerId { get; set; } = "";

    /// <summary>Allergens the customer must avoid (serious).</summary>
    [JsonProperty("allergies")] public List<string> Allergies { get; set; } = new();

    /// <summary>Allergens the customer would rather avoid (a preference).</summary>
    [JsonProperty("avoid")] public List<string> Avoid { get; set; } = new();

    /// <summary>Diet tags (registry, kind diet) the customer prefers (WI-TAG-004). A profile stored before this existed has none.</summary>
    [JsonProperty("prefer")] public List<string> Prefer { get; set; } = new();

    [JsonProperty("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>The profile as the rest of the catalog sees it. A customer who never saved one has two empty lists.</summary>
public sealed record PreferenceProfile(
    IReadOnlyList<string> Allergies, IReadOnlyList<string> Avoid, DateTimeOffset? UpdatedAt, IReadOnlyList<string>? PreferDiets = null)
{
    public static readonly PreferenceProfile Empty = new([], [], null);

    /// <summary>The diet tags the customer prefers (never null).</summary>
    public IReadOnlyList<string> Prefer => PreferDiets ?? [];
}

/// <summary>
/// Reads a customer's profile inside the catalog. Search and the cart check go through this interface and not through the container, which is
/// what the modular-monolith rule asks (ADR-0009) and what replaces the dropped snapshot event (<c>WI-PREF-002</c>).
/// </summary>
public interface IPreferenceReader
{
    Task<PreferenceProfile> GetAsync(string customerId, CancellationToken ct = default);
}
