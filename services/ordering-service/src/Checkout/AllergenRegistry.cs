using Microsoft.Extensions.Options;

namespace OrderingService.Checkout;

/// <summary>Bound from the <c>Allergens</c> configuration section.</summary>
public sealed class AllergenRegistryOptions
{
    /// <summary>How long the catalog's allergen list is trusted before it is read again. A newly added allergen is accepted by checkout after at most this long.</summary>
    public int CacheMinutes { get; set; } = 5;

    /// <summary>The most allergen ids a checkout request may carry at all, before the registry is even asked (a size guard, not the registry's size).</summary>
    public int MaxRequestIds { get; set; } = 50;
}

/// <summary>
/// The allergen ids checkout accepts (WI-ORD-009, ADR-0022 decision 9): read from the catalog's public registry and kept for a few minutes, so a checkout
/// that names allergens costs no extra call most of the time and a catalog hiccup does not stop checkouts that name none. Nothing is hard-coded here: the
/// list is the catalog's, so adding or retiring an allergen there changes what checkout accepts without a change in this service. If the list cannot be
/// read and no recent copy is held, the checkout that needs it is refused as unavailable; an order is never recorded with an id nobody checked.
/// </summary>
public sealed class AllergenRegistry(ICatalogGateway catalog, IOptions<AllergenRegistryOptions> options, TimeProvider time)
{
    private sealed record Held(IReadOnlySet<string> Ids, DateTimeOffset FetchedAt);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private Held? _held;

    public int MaxRequestIds => options.Value.MaxRequestIds;

    /// <summary>The allergen ids on offer now (from the cache when fresh). Throws <see cref="DownstreamUnavailableException"/> when there is no fresh copy and the catalog cannot answer.</summary>
    public async Task<IReadOnlySet<string>> IdsAsync(CancellationToken ct = default)
    {
        var ttl = TimeSpan.FromMinutes(Math.Max(options.Value.CacheMinutes, 0));
        if (_held is { } fresh && time.GetUtcNow() - fresh.FetchedAt < ttl) return fresh.Ids;

        await _gate.WaitAsync(ct);
        try
        {
            if (_held is { } again && time.GetUtcNow() - again.FetchedAt < ttl) return again.Ids; // another caller fetched while this one waited
            var ids = new HashSet<string>(await catalog.GetAllergenIdsAsync(ct), StringComparer.Ordinal);
            _held = new Held(ids, time.GetUtcNow());
            return ids;
        }
        finally
        {
            _gate.Release();
        }
    }
}
