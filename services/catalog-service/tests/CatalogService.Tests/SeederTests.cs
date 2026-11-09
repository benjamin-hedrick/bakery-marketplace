using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Seed;
using CatalogService.Domain;
using CatalogService.Preferences;
using CatalogService.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CatalogService.Tests;

/// <summary>WI-DEV-004: the seed, pushed through the real subscription and listing rules (in-memory backends).</summary>
public sealed class SeederTests : IAsyncLifetime
{
    private readonly FakeRepository<ListingDocument> _listings = new(d => d.Id);
    private readonly FakeRepository<VendorStatusDocument> _status = new(d => d.Id);
    private readonly InMemoryEventTransport _transport = new();
    private readonly VendorEventSubscriptions _subscriptions;
    private readonly ListingService _service;
    private readonly Seeder _seeder;

    public SeederTests()
    {
        var store = new VendorStatusStore(_status, TestServices.CacheOff());
        _subscriptions = new VendorEventSubscriptions(_transport, store, NullLogger<VendorEventSubscriptions>.Instance);
        _service = new ListingService(
            _listings, store,
            new ListingEventPublisher(_transport, _listings, Options.Create(new OutboxOptions()), TimeProvider.System, NullLogger<ListingEventPublisher>.Instance),
            TimeProvider.System, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, TestServices.CacheOff());
        _seeder = new Seeder(_listings, _transport, new FakeRepository<PreferenceProfileDocument>(d => d.Id));
    }

    public Task InitializeAsync() => _subscriptions.StartAsync(CancellationToken.None);
    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Seeded_catalog_browses_published_listings_of_both_vendors_and_hides_the_draft()
    {
        await _seeder.SeedAsync();

        var (items, _) = await _service.BrowseAsync(50, null);

        Assert.Equal(6, items.Count);
        Assert.DoesNotContain(items, l => l.Id == "listing-draft-001");
        Assert.Contains(items, l => l.VendorId == SeedData.ShopVendorId);
        Assert.Contains(items, l => l.VendorId == SeedData.IndependentVendorId);
        Assert.Null(await _service.GetPublicAsync("listing-draft-001"));
    }

    [Fact]
    public async Task Seed_prices_match_the_first_slice_contract_totals()
    {
        await _seeder.SeedAsync();

        // Contract section 7: 2x sourdough + mod-seeds = 1800; croissant + mod-extra-almond = 525; 3x (latte + both modifiers) = 1875.
        Assert.Equal(1800, 2 * Unit("listing-sourdough-001", "mod-seeds"));
        Assert.Equal(525, Unit("listing-croissant-001", "mod-extra-almond"));
        Assert.Equal(1875, 3 * Unit("listing-latte-001", "mod-extra-shot", "mod-vanilla"));
    }

    [Fact]
    public async Task Running_the_seed_twice_changes_nothing()
    {
        await _seeder.SeedAsync();
        var first = await _service.BrowseAsync(50, null);

        var second = await _seeder.SeedAsync();
        var after = await _service.BrowseAsync(50, null);

        Assert.Equal(0, second.ListingsCreated);
        Assert.Equal(SeedData.Listings().Count, second.ListingsUnchanged);
        Assert.Equal(first.Items.Select(l => (l.Id, l.Version)), after.Items.Select(l => (l.Id, l.Version)));
    }

    private static int Unit(string listingId, params string[] modifierIds)
    {
        var l = SeedData.Listings().Single(x => x.Id == listingId);
        return l.PriceCents + modifierIds.Sum(id => l.Modifiers.Single(m => m.Id == id).PriceDeltaCents);
    }
}
