using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Domain;
using CatalogService.Preferences;

namespace BakeryMarketplace.Seed;

public sealed record SeedResult(
    int ListingsCreated, int ListingsUnchanged, int VendorEventsPublished, int ProfilesCreated = 0, int ProfilesUnchanged = 0);

/// <summary>
/// Writes the fixtures through the same abstractions the service uses (<see cref="IRepository{T}"/>,
/// <see cref="IEventPublisher"/>), never raw SDK calls.
/// </summary>
/// <remarks>
/// Idempotent by construction. Listings are created only when absent (an existing listing is left alone, so a
/// developer's local edits survive a re-run). <c>VendorVerified</c> uses a fixed event id and sequence number 1:
/// catalog-service ignores any event whose sequence is not higher than the last applied, so a repeat changes nothing.
/// This stands in for admin-service's verification flow (not built) and is for local dev only. Customer allergen profiles (<see cref="SeedData.CustomerProfiles"/>)
/// follow the same rule as listings: written only when absent, so a profile a developer changed afterwards survives a re-run.
/// </remarks>
public sealed class Seeder
{
    private readonly IRepository<ListingDocument> _listings;
    private readonly IEventPublisher _events;
    private readonly IRepository<PreferenceProfileDocument>? _profiles;

    /// <param name="profiles">Where customers' saved allergen profiles live (the catalog's <c>preferences</c> container); null seeds none.</param>
    public Seeder(IRepository<ListingDocument> listings, IEventPublisher events, IRepository<PreferenceProfileDocument>? profiles = null)
    {
        _listings = listings;
        _events = events;
        _profiles = profiles;
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

        int profilesCreated = 0, profilesUnchanged = 0;
        if (_profiles is not null)
        {
            foreach (var profile in SeedData.CustomerProfiles())
            {
                if (await _profiles.GetAsync(profile.Id, profile.CustomerId, ct) is not null)
                {
                    profilesUnchanged++;
                    continue;
                }
                await _profiles.SaveAsync(profile, profile.CustomerId, ct);
                profilesCreated++;
            }
        }

        return new SeedResult(created, unchanged, published, profilesCreated, profilesUnchanged);
    }

    private static Guid DeterministicEventId(string vendorId)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes("seed:VendorVerified:" + vendorId));
        return new Guid(hash.AsSpan(0, 16));
    }
}
