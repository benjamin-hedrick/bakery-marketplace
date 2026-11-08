using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CatalogService.Tests;

/// <summary>Runs only when COSMOS_CONNECTION_STRING points at a running Cosmos emulator; otherwise reported as skipped, never faked.</summary>
public sealed class EmulatorFactAttribute : FactAttribute
{
    public static readonly string? ConnectionString = Environment.GetEnvironmentVariable("COSMOS_CONNECTION_STRING");

    public EmulatorFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(ConnectionString)) Skip = "Set COSMOS_CONNECTION_STRING to run against the Cosmos emulator.";
    }
}

/// <summary>
/// The catalog's outbox, reservation window and reservation time to live on the real Cosmos SDK (register items 30, 62 and 66): the sparse
/// <c>pendingSince</c> and <c>parkedAt</c> queries across partitions, conditional saves of a listing that carries an outbox, the
/// <c>docType</c>-filtered reservation query in the shared container, and a container created with a default time to live of -1.
/// </summary>
public sealed class CosmosCatalogTests : IAsyncLifetime
{
    private const string Vendor = "vendor-cosmos";

    private CosmosClient? _client;
    private IRepository<ListingDocument>? _listings;
    private IRepository<StockReservationDocument>? _reservations;
    private ListingService? _service;
    private StockReservationService? _reservation;
    private ListingEventPublisher? _publisher;
    private ListingOutboxRelay? _relay;
    private readonly FlakyEvents _events = new();
    private readonly ManualTime _time = new(DateTimeOffset.UtcNow);
    private readonly string _database = "catalog-" + Guid.NewGuid().ToString("N")[..8];

    private sealed class ManualTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FlakyEvents : IEventPublisher
    {
        public bool Fail { get; set; }
        public List<string> Published { get; } = [];

        public Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
        {
            if (Fail) throw new InvalidOperationException("scripted broker failure");
            Published.Add(envelope.EventType);
            return Task.CompletedTask;
        }
    }

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        var container = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("catalog", "/vendorId") { DefaultTimeToLive = -1 })).Container;

        _listings = new CosmosRepository<ListingDocument>(container);
        _reservations = new CosmosRepository<StockReservationDocument>(container);
        var status = new CosmosRepository<VendorStatusDocument>(container);
        await status.SaveAsync(new VendorStatusDocument { Id = Vendor, Verified = true, LastSequence = 1 }, VendorStatusStore.Partition);
        var vendors = new VendorStatusStore(status);
        var options = Options.Create(new OutboxOptions());
        _publisher = new ListingEventPublisher(_events, _listings, options, _time, NullLogger<ListingEventPublisher>.Instance);
        _relay = new ListingOutboxRelay(_listings, _publisher, options, _time, NullLogger<ListingOutboxRelay>.Instance);
        _service = new ListingService(_listings, vendors, _publisher, _time, NullLogger<ListingService>.Instance);
        _reservation = new StockReservationService(_listings, _reservations, new CosmosBatchFactory(container), vendors, _publisher, _time);
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    private static ListingRequest Request(StockRequest? stock = null) => new("Loaf", null, "bread", 800, null, null, "Published", stock);

    [EmulatorFact]
    public async Task AnEventThatCouldNotBePublishedIsStoredWithTheListingAndTheRelayFindsItThroughTheSparseQuery()
    {
        _events.Fail = true;
        var created = (await _service!.CreateAsync(Vendor, Request())).Listing!;
        var stored = (await _listings!.GetAsync(created.Id, Vendor))!;
        _events.Fail = false;
        _time.Now = _time.Now.AddMinutes(1);

        var swept = await _relay!.SweepOnceAsync(default);
        var after = (await _listings.GetAsync(created.Id, Vendor))!;

        Assert.Equal(ListingEventTypes.Published, Assert.Single(stored.Outbox).EventType);
        Assert.NotNull(stored.PendingSince);
        Assert.Equal((1, 1), swept);
        Assert.Empty(after.Outbox);
        Assert.Null(after.PendingSince);
        Assert.Equal([ListingEventTypes.Published], _events.Published);
    }

    [EmulatorFact]
    public async Task AListingWhoseEventKeepsFailingIsParkedAndFoundByTheParkedQueryThenUnparked()
    {
        _events.Fail = true;
        var created = (await _service!.CreateAsync(Vendor, Request())).Listing!;
        _time.Now = _time.Now.AddMinutes(1);
        for (var i = 1; i < new OutboxOptions().MaxPublishAttempts; i++) await _relay!.SweepOnceAsync(default);

        var parked = (await _listings!.GetAsync(created.Id, Vendor))!;
        var found = await _publisher!.FindParkedAsync(10);
        _events.Fail = false;
        var swept = await _relay!.SweepOnceAsync(default);
        var unparked = await _publisher.UnparkAsync(created.Id, Vendor);
        var sweptAgain = await _relay.SweepOnceAsync(default);

        Assert.NotNull(parked.ParkedAt);
        Assert.Null(parked.PendingSince);
        Assert.Equal(created.Id, Assert.Single(found).Id);
        Assert.Equal((0, 0), swept);
        Assert.True(unparked);
        Assert.Equal((1, 1), sweptAgain);
    }

    [EmulatorFact]
    public async Task AReservationWritesItsLowStockEventInTheSameBatchAndTheWindowQueryFindsOnlyActiveReservationsInRange()
    {
        var listing = (await _service!.CreateAsync(Vendor, Request(new StockRequest(10, null, 3)))).Listing!;
        _events.Fail = true;

        var reserved = await _reservation!.ReserveAsync("order-1", Vendor, [(listing.Id, 8)]);
        var stored = (await _listings!.GetAsync(listing.Id, Vendor))!;
        await _reservation.ReserveAsync("order-2", Vendor, [(listing.Id, 1)]);
        await _reservation.ReleaseAsync("order-2", Vendor);

        _time.Now = _time.Now.AddMinutes(30);
        var window = await _reservation.ListActiveAsync(TimeSpan.FromMinutes(15), TimeSpan.FromHours(24), 10, null);
        var tooNew = await _reservation.ListActiveAsync(TimeSpan.FromMinutes(45), TimeSpan.FromHours(24), 10, null);
        var released = (await _reservations!.GetAsync(StockReservationDocument.IdFor("order-2"), Vendor))!;

        Assert.Equal(ReservationOutcome.Reserved, reserved.Outcome);
        Assert.Equal(2, stored.AvailableQuantity);
        Assert.Equal(ListingEventTypes.LowStockDetected, Assert.Single(stored.Outbox).EventType);
        Assert.Equal(["order-1"], window.Select(r => r.OrderId)); // order-2 was released; no listing is mistaken for a reservation
        Assert.Empty(tooNew);
        Assert.Equal(30 * 24 * 60 * 60, released.TimeToLiveSeconds);
    }

    [EmulatorFact]
    public async Task AVendorsOwnListQueryReturnsTheirListingsAndNeverTheirReservationRecords()
    {
        var listing = (await _service!.CreateAsync(Vendor, Request(new StockRequest(10, null, 3)))).Listing!;
        await _reservation!.ReserveAsync("order-1", Vendor, [(listing.Id, 1)]);

        var (items, _) = await _service.ListOwnAsync(Vendor, null, 10, null);
        var asListing = await _service.GetOwnAsync(StockReservationDocument.IdFor("order-1"), Vendor);

        Assert.Equal([listing.Id], items.Select(i => i.Id));
        Assert.Null(asListing);
    }
}
