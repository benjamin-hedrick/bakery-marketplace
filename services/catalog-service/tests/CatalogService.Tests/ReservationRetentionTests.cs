using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;

namespace CatalogService.Tests;

/// <summary>Register item 66: a released reservation carries a time to live so it does not accumulate; an active one never does.</summary>
public sealed class ReservationRetentionTests
{
    private const string Vendor = "vendor-1";

    private readonly FakeDatabase _database = new();
    private readonly FakeRepository<ListingDocument> _listings;
    private readonly FakeRepository<StockReservationDocument> _reservations;
    private readonly ListingService _service;
    private readonly StockReservationService _reservation;

    public ReservationRetentionTests()
    {
        _listings = new FakeRepository<ListingDocument>(d => d.Id, _database);
        _reservations = new FakeRepository<StockReservationDocument>(d => d.Id, _database);
        var status = new FakeRepository<VendorStatusDocument>(d => d.Id);
        status.SaveAsync(new VendorStatusDocument { Id = Vendor, Verified = true, LastSequence = 1 }, VendorStatusStore.Partition).GetAwaiter().GetResult();
        var vendors = new VendorStatusStore(status);
        var publisher = new ListingEventPublisher(
            new InMemoryEventTransport(), _listings, Options.Create(new CatalogOutboxOptions()), TimeProvider.System, NullLogger<ListingEventPublisher>.Instance);
        _service = new ListingService(_listings, vendors, publisher, TimeProvider.System, NullLogger<ListingService>.Instance);
        _reservation = new StockReservationService(_listings, _reservations, new FakeBatchFactory(_database), vendors, publisher, TimeProvider.System);
    }

    private async Task<string> ListingWithStockAsync() =>
        (await _service.CreateAsync(Vendor, new ListingRequest("Loaf", null, "bread", 800, null, null, "Published", new StockRequest(10, null, null)))).Listing!.Id;

    [Fact]
    public async Task AnActiveReservationHasNoTimeToLiveAndAReleasedOneHasThirtyDays()
    {
        var listingId = await ListingWithStockAsync();
        await _reservation.ReserveAsync("order-1", Vendor, [(listingId, 2)]);
        var active = (await _reservations.GetAsync(StockReservationDocument.IdFor("order-1"), Vendor))!;

        await _reservation.ReleaseAsync("order-1", Vendor);
        var released = (await _reservations.GetAsync(StockReservationDocument.IdFor("order-1"), Vendor))!;

        Assert.Null(active.TimeToLiveSeconds);
        Assert.Null(JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(active))["ttl"]); // absent, so Cosmos never expires it
        Assert.Equal(30 * 24 * 60 * 60, released.TimeToLiveSeconds);
        Assert.Equal(30 * 24 * 60 * 60, JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(released))["ttl"]!.Value<int>());
    }

    [Fact]
    public async Task ListingsAndVendorStatusDocumentsNeverCarryATimeToLive()
    {
        var listingId = await ListingWithStockAsync();

        var json = JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject((await _listings.GetAsync(listingId, Vendor))!));

        Assert.Null(json["ttl"]);
        Assert.Null(JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(new VendorStatusDocument { Id = "v" }))["ttl"]);
    }
}
