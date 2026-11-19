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
public sealed class ReservationRetentionTests : IAsyncLifetime
{
    private const string Vendor = "vendor-1";

    private readonly FakeDatabase _database = new();
    private readonly FakeRepository<VendorStatusDocument> _status = new(d => d.Id);
    private readonly FakeRepository<ListingDocument> _listings;
    private readonly FakeRepository<StockReservationDocument> _reservations;
    private readonly ListingService _service;
    private readonly StockReservationService _reservation;

    public ReservationRetentionTests()
    {
        _listings = new FakeRepository<ListingDocument>(d => d.Id, _database);
        _reservations = new FakeRepository<StockReservationDocument>(d => d.Id, _database);
        var vendors = new VendorStatusStore(_status, TestServices.CacheOff());
        var publisher = new ListingEventPublisher(
            new InMemoryEventTransport(), _listings, Options.Create(new OutboxOptions()), TimeProvider.System, NullLogger<ListingEventPublisher>.Instance);
        _service = new ListingService(_listings, vendors, publisher, TimeProvider.System, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, TestServices.CacheOff());
        _reservation = new StockReservationService(_listings, _reservations, new FakeBatchFactory(_database), vendors, publisher, TimeProvider.System, TestServices.CacheOff());
    }

    // Not in the constructor: blocking a test worker thread on a call that yields can deadlock the run on a machine with few cores.
    public Task InitializeAsync() =>
        _status.SaveAsync(new VendorStatusDocument { Id = Vendor, Verified = true, LastSequence = 1 }, VendorStatusStore.Partition);

    public Task DisposeAsync() => Task.CompletedTask;

    private async Task<string> ListingWithStockAsync() =>
        (await _service.CreateWithNewKeyAsync(Vendor, new ListingRequest("Loaf", null, "bread", 800, null, null, "Published", new StockRequest(10, null, null)))).Listing!.Id;

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

    [Fact]
    public async Task EveryListingIsWrittenWithItsKindAndARecordOfAnotherKindIsNeverReadAsAListing()
    {
        var listingId = await ListingWithStockAsync();
        await _reservation.ReserveAsync("order-1", Vendor, [(listingId, 2)]);
        var reservation = (await _reservations.GetAsync(StockReservationDocument.IdFor("order-1"), Vendor))!;
        // What the shared container hands back when the listing repository meets the reservation record. Even with a status a listing could
        // have, the kind keeps it out (register 66: before, only the status filter did).
        var asListing = Newtonsoft.Json.JsonConvert.DeserializeObject<ListingDocument>(Newtonsoft.Json.JsonConvert.SerializeObject(reservation))!;
        asListing.Status = ListingStatuses.Published;
        await _listings.SaveAsync(asListing, Vendor);

        var listingJson = JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject((await _listings.GetAsync(listingId, Vendor))!));
        var (browse, _) = await _service.BrowseAsync(10, null);
        var (own, _) = await _service.ListOwnAsync(Vendor, null, 10, null);
        var reserveIt = await _reservation.ReserveAsync("order-2", Vendor, [(reservation.Id, 1)]);

        Assert.Equal(ListingDocument.Kind, listingJson["docType"]!.Value<string>());
        Assert.Equal([listingId], browse.Select(l => l.Id));
        Assert.Equal([listingId], own.Select(l => l.Id));
        Assert.Null(await _service.GetOwnAsync(reservation.Id, Vendor));
        Assert.Null(await _service.GetPublicAsync(reservation.Id));
        Assert.Equal(StockRejections.ListingNotFound, Assert.Single(reserveIt.Rejections!).Reason);
    }
}
