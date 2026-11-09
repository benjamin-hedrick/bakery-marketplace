using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;

namespace CatalogService.Tests;

/// <summary>Register item 30: listing events are stored with the change, published inline, and swept up by the relay when the inline path misses.</summary>
public sealed class ListingOutboxTests
{
    private const string Vendor = "vendor-1";

    private sealed class ManualTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class FlakyEvents : IEventPublisher
    {
        public bool Fail { get; set; }
        public string? FailOnlyType { get; set; }
        public List<(Guid EventId, string EventType, long Sequence)> Published { get; } = [];

        public Task PublishAsync<T>(DomainEventEnvelope<T> envelope, CancellationToken ct = default)
        {
            if (Fail || FailOnlyType == envelope.EventType) throw new InvalidOperationException("scripted broker failure");
            Published.Add((envelope.EventId, envelope.EventType, envelope.SequenceNumber));
            return Task.CompletedTask;
        }
    }

    private sealed class Rig
    {
        public FakeDatabase Database { get; } = new();
        public FakeRepository<ListingDocument> Listings { get; }
        public FakeRepository<StockReservationDocument> Reservations { get; }
        public FlakyEvents Events { get; } = new();
        public ManualTime Time { get; } = new(new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero));
        public OutboxOptions Options { get; } = new();
        public ListingEventPublisher Publisher { get; }
        public ListingOutboxRelay Relay { get; }
        public ListingService Service { get; }
        public StockReservationService Reservation { get; }

        private readonly FakeRepository<VendorStatusDocument> _status = new(d => d.Id);

        private Rig()
        {
            Listings = new FakeRepository<ListingDocument>(d => d.Id, Database);
            Reservations = new FakeRepository<StockReservationDocument>(d => d.Id, Database);
            var vendors = new VendorStatusStore(_status, TestServices.CacheOff());
            Publisher = new ListingEventPublisher(Events, Listings, Microsoft.Extensions.Options.Options.Create(Options), Time, NullLogger<ListingEventPublisher>.Instance);
            Relay = new ListingOutboxRelay(Listings, Publisher, Microsoft.Extensions.Options.Options.Create(Options), Time, NullLogger<ListingOutboxRelay>.Instance);
            Service = new ListingService(Listings, vendors, Publisher, Time, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, TestServices.CacheOff());
            Reservation = new StockReservationService(Listings, Reservations, new FakeBatchFactory(Database), vendors, Publisher, Time, TestServices.CacheOff());
        }

        // Built asynchronously: blocking a test worker thread on a call that yields can deadlock the run on a machine with few cores.
        public static async Task<Rig> CreateAsync()
        {
            var rig = new Rig();
            await rig._status.SaveAsync(new VendorStatusDocument { Id = Vendor, Verified = true, LastSequence = 1 }, VendorStatusStore.Partition);
            return rig;
        }

        public static ListingRequest Request(string status = "Published", StockRequest? stock = null) =>
            new("Sourdough", null, "bread", 800, null, null, status, stock);

        public async Task<ListingDocument> StoredAsync(string id) => (await Listings.GetAsync(id, Vendor))!;
    }

    [Fact]
    public async Task APublishedListingWhoseEventCouldNotBePublishedStillHasTheEventStoredWithIt()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;

        var result = await rig.Service.CreateAsync(Vendor, Rig.Request());

        Assert.Equal(ListingOutcome.Created, result.Outcome);
        var stored = await rig.StoredAsync(result.Listing!.Id);
        var entry = Assert.Single(stored.Outbox);
        Assert.Equal(ListingEventTypes.Published, entry.EventType);
        Assert.Equal(stored.Version, entry.SequenceNumber);
        Assert.NotNull(stored.PendingSince);
        Assert.Empty(rig.Events.Published);
    }

    [Fact]
    public async Task ADraftRaisesNoEvent()
    {
        var rig = await Rig.CreateAsync();

        var result = await rig.Service.CreateAsync(Vendor, Rig.Request("Draft"));

        Assert.Empty((await rig.StoredAsync(result.Listing!.Id)).Outbox);
        Assert.Empty(rig.Events.Published);
    }

    [Fact]
    public async Task APublishThatSucceedsInlineEmptiesTheOutboxAndTheSparseMarker()
    {
        var rig = await Rig.CreateAsync();

        var result = await rig.Service.CreateAsync(Vendor, Rig.Request());

        var published = Assert.Single(rig.Events.Published);
        Assert.Equal(ListingEventTypes.Published, published.EventType);
        var stored = await rig.StoredAsync(result.Listing!.Id);
        Assert.Empty(stored.Outbox);
        Assert.Null(stored.PendingSince);
        var json = JObject.Parse(Newtonsoft.Json.JsonConvert.SerializeObject(stored));
        Assert.Null(json["outbox"]); // absent, not empty: the property is what the sparse index keys on
        Assert.Null(json["pendingSince"]);
    }

    [Fact]
    public async Task TheRelayPublishesWhatTheInlinePathMissedOnceTheGracePeriodHasPassedAndTheIdIsStable()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request())).Listing!;
        var expectedId = Guid.Parse(ListingOutboxEntry.IdFor(created.Id, created.Version, ListingEventTypes.Published));
        rig.Events.Fail = false;

        var tooSoon = await rig.Relay.SweepOnceAsync(default);
        rig.Time.Now = rig.Time.Now.AddSeconds(rig.Options.GraceSeconds + 1);
        var later = await rig.Relay.SweepOnceAsync(default);
        var again = await rig.Relay.SweepOnceAsync(default);

        Assert.Equal((0, 0), tooSoon); // possibly still being published inline: left alone
        Assert.Equal((1, 1), later);
        Assert.Equal((0, 0), again);
        Assert.Equal(expectedId, Assert.Single(rig.Events.Published).EventId);
        Assert.Empty((await rig.StoredAsync(created.Id)).Outbox);
    }

    [Fact]
    public async Task ARepeatedPublishAfterALostCleanupCarriesTheSameEventId()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request())).Listing!;
        rig.Events.Fail = false;
        var staleRead = await rig.StoredAsync(created.Id);

        await rig.Publisher.PublishPendingAsync(await rig.StoredAsync(created.Id));
        await rig.Publisher.PublishPendingAsync(staleRead); // a second instance holding the same stale read

        Assert.Equal(2, rig.Events.Published.Count);
        Assert.Single(rig.Events.Published.Select(p => p.EventId).Distinct());
        Assert.Empty((await rig.StoredAsync(created.Id)).Outbox);
    }

    [Fact]
    public async Task ALowStockEventFromAnAdjustmentIsStoredInTheSameWriteAsTheNewQuantity()
    {
        var rig = await Rig.CreateAsync();
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request("Draft", new StockRequest(10, null, 3)))).Listing!;
        rig.Events.Fail = true;

        await rig.Service.AdjustStockAsync(created, -8);

        var stored = await rig.StoredAsync(created.Id);
        Assert.Equal(2, stored.AvailableQuantity);
        Assert.Equal(ListingEventTypes.LowStockDetected, Assert.Single(stored.Outbox).EventType);
    }

    [Fact]
    public async Task ALowStockEventFromAReservationIsStoredInTheSameBatchAsTheDecrement()
    {
        var rig = await Rig.CreateAsync();
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request("Published", new StockRequest(10, null, 3)))).Listing!;
        rig.Events.Fail = true;

        var result = await rig.Reservation.ReserveAsync("order-1", Vendor, [(created.Id, 8)]);

        Assert.Equal(ReservationOutcome.Reserved, result.Outcome);
        var stored = await rig.StoredAsync(created.Id);
        Assert.Equal(2, stored.AvailableQuantity);
        Assert.Equal(ListingEventTypes.LowStockDetected, Assert.Single(stored.Outbox).EventType);

        rig.Events.Fail = false;
        rig.Time.Now = rig.Time.Now.AddSeconds(30);
        await rig.Relay.SweepOnceAsync(default);
        Assert.Equal([ListingEventTypes.Published, ListingEventTypes.LowStockDetected], rig.Events.Published.Select(p => p.EventType));
    }

    [Fact]
    public async Task APublishFailureLeavesThatEventAndLaterOnesPendingSoNothingOvertakesIt()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request("Published", new StockRequest(10, null, 3)))).Listing!;
        await rig.Service.AdjustStockAsync(await rig.StoredAsync(created.Id), -8); // Published at version 1, LowStockDetected at version 2
        rig.Events.Fail = false;
        rig.Events.FailOnlyType = ListingEventTypes.LowStockDetected;

        var result = await rig.Publisher.PublishPendingAsync(await rig.StoredAsync(created.Id));

        Assert.Equal(new OutboxPublishResult(1, true), result);
        Assert.Equal([ListingEventTypes.Published], rig.Events.Published.Select(p => p.EventType));
        Assert.Equal(ListingEventTypes.LowStockDetected, Assert.Single((await rig.StoredAsync(created.Id)).Outbox).EventType);
    }

    [Fact]
    public async Task AnEventThatKeepsFailingParksTheListingAtTheLimitAndTheRelayStopsRetryingIt()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request())).Listing!;
        rig.Time.Now = rig.Time.Now.AddSeconds(30);

        for (var i = 1; i < rig.Options.MaxPublishAttempts; i++) await rig.Relay.SweepOnceAsync(default); // the inline attempt was the first
        var parkedStored = await rig.StoredAsync(created.Id);

        Assert.NotNull(parkedStored.ParkedAt);
        Assert.Null(parkedStored.PendingSince);
        Assert.Single(parkedStored.Outbox); // kept, not dropped
        rig.Events.Fail = false;
        Assert.Equal((0, 0), await rig.Relay.SweepOnceAsync(default));
        Assert.Empty(rig.Events.Published);
        Assert.Equal(created.Id, Assert.Single(await rig.Publisher.FindParkedAsync(10)).Id);
    }

    [Fact]
    public async Task UnparkingClearsTheMarkerAndTheCountsAndTheRelayPublishesAgain()
    {
        var rig = await Rig.CreateAsync();
        rig.Events.Fail = true;
        var created = (await rig.Service.CreateAsync(Vendor, Rig.Request())).Listing!;
        rig.Time.Now = rig.Time.Now.AddSeconds(30);
        for (var i = 1; i < rig.Options.MaxPublishAttempts; i++) await rig.Relay.SweepOnceAsync(default);
        Assert.NotNull((await rig.StoredAsync(created.Id)).ParkedAt);
        rig.Events.Fail = false;

        Assert.True(await rig.Publisher.UnparkAsync(created.Id, Vendor));
        var unparked = await rig.StoredAsync(created.Id);
        var swept = await rig.Relay.SweepOnceAsync(default);

        Assert.Null(unparked.ParkedAt);
        Assert.All(unparked.Outbox, e => Assert.Equal(0, e.Attempts));
        Assert.Equal((1, 1), swept);
        Assert.Single(rig.Events.Published);
    }

    [Fact]
    public void TheRelayDelayStaysAtTheBaseRateThenGrowsWhileIdleAndStopsAtTheMaximum()
    {
        var options = new OutboxOptions { SweepSeconds = 5, MaxIdleSeconds = 60 };
        double Seconds(int empty) => OutboxTiming.NextDelay(options, empty, 0.5).TotalSeconds;

        Assert.Equal(5, Seconds(0), 3);
        Assert.Equal(5, Seconds(2), 3);
        Assert.Equal(10, Seconds(3), 3);
        Assert.Equal(60, Seconds(10), 3);
    }

    [Fact]
    public void AListingStoredBeforeTheOutboxExistedReadsAsNothingPending()
    {
        var doc = Newtonsoft.Json.JsonConvert.DeserializeObject<ListingDocument>("""{"id":"l","vendorId":"v","name":"n","category":"c","priceCents":1,"status":"Published","version":1}""")!;

        Assert.Empty(doc.Outbox);
        Assert.Null(doc.PendingSince);
        Assert.Null(doc.ParkedAt);
    }
}
