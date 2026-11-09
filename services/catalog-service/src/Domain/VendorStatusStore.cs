using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace CatalogService.Domain;

/// <summary>
/// catalog-service's derived view of vendor verification, built only from <c>VendorVerified</c> /
/// <c>VendorSuspended</c> events (never from client input). One document per vendor.
/// </summary>
/// <remarks>
/// All status documents share one logical partition (<see cref="VendorStatusStore.Partition"/>), keyed by vendor id,
/// so the store can both point-read a vendor and enumerate verified vendors through the single-partition
/// <see cref="IRepository{T}"/> contract, with no cache (evictable) and no cross-partition query.
/// </remarks>
public sealed class VendorStatusDocument
{
    [JsonProperty("id")] public string Id { get; set; } = "";

    /// <summary>The Cosmos partition key (<c>/vendorId</c>) value; constant for all status documents.</summary>
    [JsonProperty("vendorId")] public string PartitionValue { get; set; } = VendorStatusStore.Partition;

    [JsonProperty("verified")] public bool Verified { get; set; }

    /// <summary>Highest event sequence number applied for this vendor (per-aggregate ordering, ADR-0003).</summary>
    [JsonProperty("lastSequence")] public long LastSequence { get; set; }

    [JsonProperty("updatedAt")] public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class VendorStatusStore
{
    public const string Partition = "_vendor-status";

    private readonly IRepository<VendorStatusDocument> _repository;
    private readonly CatalogService.Services.ListingCache _cache;

    public VendorStatusStore(IRepository<VendorStatusDocument> repository, CatalogService.Services.ListingCache cache)
    {
        _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        _cache = cache;
    }

    public async Task<bool> IsVerifiedAsync(string vendorId, CancellationToken ct = default)
    {
        var doc = await _repository.GetAsync(vendorId, Partition, ct);
        return doc?.Verified == true;
    }

    public async Task<IReadOnlyList<string>> VerifiedVendorIdsAsync(CancellationToken ct = default)
    {
        var ids = new List<string>();
        await foreach (var doc in _repository.QueryAsync(Partition, q => q.Where(d => d.Verified), ct))
        {
            ids.Add(doc.Id);
        }
        ids.Sort(StringComparer.Ordinal);
        return ids;
    }

    /// <summary>
    /// Applies a verification change. Delivery is at-least-once and may be reordered (ADR-0003), so an event is
    /// applied only if its sequence number is higher than the last one applied for that vendor; duplicates and
    /// stale events are ignored. Returns whether the event changed stored state.
    /// </summary>
    public async Task<bool> ApplyAsync(
        string vendorId, bool verified, long sequence, DateTimeOffset occurredAt, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(vendorId)) throw new ArgumentException("Vendor id is required.", nameof(vendorId));

        var existing = await _repository.GetAsync(vendorId, Partition, ct);
        if (existing is not null && sequence <= existing.LastSequence) return false;

        await _repository.SaveAsync(new VendorStatusDocument
        {
            Id = vendorId,
            Verified = verified,
            LastSequence = sequence,
            UpdatedAt = occurredAt,
        }, Partition, ct);

        // A verification change decides which vendors' listings are public: drop the cached vendor list and that vendor's cached listings (WI-CAT-003).
        await _cache.InvalidateVerifiedVendorsAsync();
        await _cache.InvalidateVendorAsync(vendorId);
        return true;
    }
}
