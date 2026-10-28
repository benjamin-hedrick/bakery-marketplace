namespace BakeryMarketplace.Data;

/// <summary>
/// An entity that carries its store version token, so a writer can say "save this only if nobody changed it since I read it"
/// (<see cref="IRepository{T}.SaveIfUnchangedAsync"/>). Opt-in: entities that do not implement it keep plain last-write-wins saves.
/// For Cosmos, map <see cref="ETag"/> to the system property <c>_etag</c> and ignore it when null:
/// <c>[JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)]</c>. Open item 30 (WI-CAT-005).
/// </summary>
public interface IETagged
{
    string Id { get; }

    /// <summary>The version token the entity was read with; null for an entity that has never been stored.</summary>
    string? ETag { get; set; }
}
