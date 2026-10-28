using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using BakeryMarketplace.Eventing;
using CatalogService.Domain;

namespace BakeryMarketplace.Seed;

public sealed record SeedResult(int ListingsCreated, int ListingsUnchanged, int VendorEventsPublished);

/// <summary>
/// Writes the fixtures through the same abstractions the service uses (<see cref="IRepository{T}"/>,
/// <see cref="IEventPublisher"/>), never raw SDK calls.
/// </summary>
/// <remarks>
/// Idempotent by construction. Listings are created only when absent (an existing listing is left alone, so a
/// developer's local edits survive a re-run). <c>VendorVerified</c> uses a fixed event id and sequence number 1:
/// catalog-service ignores any event whose sequence is not higher than the last applied, so a repeat changes nothing.
/// This stands in for admin-service's verification flow (not built) and is for local dev only.
/// </remarks>
public sealed class Seeder
{
    private readonly IRepository<ListingDocument> _listings;
    private readonly IEventPublisher _events;

    public Seeder(IRepository<ListingDocument> listings, IEventPublisher events)
    {
        _listings = listings;
        _events = events;
    }

    public async Task<SeedResult> SeedAsync(CancellationToken ct = default)
    {
        int created = 0, unchanged = 0, published = 0;

        foreach (var listing in SeedData.Listings())
        {
            if (await _listings.GetAsync(listing.Id, listing.VendorId, ct) is not null)
            {
                unchanged++;
                continue;
            }
            await _listings.SaveAsync(listing, listing.VendorId, ct);
            created++;
        }

        foreach (var vendorId in SeedData.Vendors.Keys)
        {
            await _events.PublishAsync(new DomainEventEnvelope<VendorVerifiedPayload>(
                DeterministicEventId(vendorId), "VendorVerified", 1, SeedData.Stamp,
                "Vendor", vendorId, SequenceNumber: 1, new VendorVerifiedPayload(vendorId)), ct);
            published++;
        }

        return new SeedResult(created, unchanged, published);
    }

    private static Guid DeterministicEventId(string vendorId)
    {
        var hash = System.Security.Cryptography.MD5.HashData(System.Text.Encoding.UTF8.GetBytes("seed:VendorVerified:" + vendorId));
        return new Guid(hash);
    }
}
