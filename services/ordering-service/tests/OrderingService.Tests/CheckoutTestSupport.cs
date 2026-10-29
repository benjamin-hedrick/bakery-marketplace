using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Orders;
using OrderingService.Outbox;
using OrderingService.Persistence;

namespace OrderingService.Tests;

/// <summary>Test doubles and builders for checkout. Time and the catalog are always scripted, never real.</summary>
internal static class Seed
{
    // 08:00 Eastern on a winter Thursday (13:00Z): windows from 13:30Z are open.
    public static readonly DateTimeOffset Now = new(2026, 1, 15, 13, 0, 0, TimeSpan.Zero);

    public static readonly DateTimeOffset WindowStart = new(2026, 1, 15, 14, 0, 0, TimeSpan.Zero); // 09:00 EST
    public static readonly DateTimeOffset WindowEnd = WindowStart.AddMinutes(15);

    // The first-slice contract section 7 fixtures.
    public const string Vendor = "vendor-shop-001";

    public static CatalogListing Sourdough(int? maxPerOrder = 4, string status = "Published", string vendor = Vendor) =>
        new("listing-sourdough-001", vendor, "Country Sourdough", 800, status,
            [new("mod-seeds", 100), new("mod-sliced", 0)], new CatalogStock("inStock", maxPerOrder));

    public static CatalogListing Croissant() =>
        new("listing-croissant-001", Vendor, "Almond Croissant", 450, "Published", [new("mod-extra-almond", 75)], new CatalogStock("low", null));

    public static CatalogListing Latte() =>
        new("listing-latte-001", Vendor, "Oat Milk Latte", 500, "Published",
            [new("mod-extra-shot", 75), new("mod-vanilla", 50)], new CatalogStock("inStock", null));

    public static CheckoutLineRequest Line(string listingId, int quantity, params string[] modifiers) => new(listingId, [.. modifiers], quantity);

    public static CheckoutRequest Request(IEnumerable<CheckoutLineRequest>? lines = null, bool window = true, string vendor = Vendor) => new(
        vendor,
        [.. lines ?? [Line("listing-sourdough-001", 2, "mod-seeds")]],
        window ? new PickupWindowRequest(WindowStart, WindowEnd) : null);

    public static string NewKey() => "key-" + Guid.NewGuid().ToString("N");
}

internal sealed class ManualTime(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;
    public override DateTimeOffset GetUtcNow() => Now;
}

/// <summary>An in-memory <see cref="ICatalogGateway"/> with scripted behaviour and a record of every call.</summary>
internal sealed class FakeCatalog : ICatalogGateway
{
    private readonly object _gate = new();
    public Dictionary<string, CatalogListing> Listings { get; } = new();
    public HashSet<string> ReservedOrders { get; } = [];
    public List<(string OrderId, string VendorId, IReadOnlyList<(string ListingId, int Quantity)> Lines)> ReserveCalls { get; } = [];
    public List<string> ReleaseCalls { get; } = [];
    public int ListingReads;

    public StockReservationOutcome? ReserveOutcome { get; set; } // null = reserve successfully
    public bool ListingReadsFail { get; set; }
    public bool ReserveFails { get; set; }
    public bool ReleaseFails { get; set; }

    public static FakeCatalog WithTheSeed()
    {
        var catalog = new FakeCatalog();
        foreach (var l in new[] { Seed.Sourdough(), Seed.Croissant(), Seed.Latte() }) catalog.Listings[l.Id] = l;
        return catalog;
    }

    public async Task<CatalogListing?> GetListingAsync(string listingId, CancellationToken ct = default)
    {
        await Task.Yield();
        Interlocked.Increment(ref ListingReads);
        if (ListingReadsFail) throw new DownstreamUnavailableException("scripted outage");
        return Listings.GetValueOrDefault(listingId);
    }

    public async Task<StockReservationOutcome> ReserveAsync(
        string orderId, string vendorId, IReadOnlyList<(string ListingId, int Quantity)> lines, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate) ReserveCalls.Add((orderId, vendorId, lines));
        if (ReserveFails) throw new DownstreamUnavailableException("scripted outage");
        if (ReserveOutcome is { } scripted) return scripted;
        lock (_gate) ReservedOrders.Add(orderId); // idempotent by order id, like the real catalog
        return new StockReservationOutcome(true);
    }

    public async Task ReleaseAsync(string orderId, string vendorId, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate)
        {
            ReleaseCalls.Add(orderId);
            if (!ReleaseFails) ReservedOrders.Remove(orderId);
        }
        if (ReleaseFails) throw new DownstreamUnavailableException("scripted outage");
    }
}

internal sealed class RecordingPayments : IPaymentProcessor
{
    public List<PaymentRequest> Requests { get; } = [];
    private readonly object _gate = new();

    public async Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate) Requests.Add(request);
        return request.ForceDecline ? new PaymentResult(false) : new PaymentResult(true, "recorded");
    }
}

/// <summary>An order repository whose conditional writes can be made to fail, to prove checkout cleans up after itself.</summary>
internal sealed class FlakyOrderRepository(IRepository<OrderDocument> inner) : IRepository<OrderDocument>
{
    public bool FailWrites { get; set; }

    /// <summary>Pretends another request created the order first: the next conditional save reports a conflict.</summary>
    public bool ConflictOnNextCreate { get; set; }

    /// <summary>Every conditional save reports a conflict (an order that other writers keep changing).</summary>
    public bool ConflictAlways { get; set; }

    /// <summary>After a conflict was reported, reads fail (to prove a lost race never releases the winner's stock).</summary>
    public bool FailReadsAfterConflict { get; set; }

    private bool _conflictReported;

    public Task<OrderDocument?> GetAsync(string id, string partitionKey, CancellationToken ct = default) =>
        _conflictReported && FailReadsAfterConflict ? throw new InvalidOperationException("scripted read failure") : inner.GetAsync(id, partitionKey, ct);
    public Task<OrderDocument> SaveAsync(OrderDocument entity, string partitionKey, CancellationToken ct = default) => inner.SaveAsync(entity, partitionKey, ct);
    public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default) => inner.DeleteAsync(id, partitionKey, ct);

    public IAsyncEnumerable<OrderDocument> QueryAsync(
        string partitionKey, Func<IQueryable<OrderDocument>, IQueryable<OrderDocument>> query, CancellationToken ct = default) =>
        inner.QueryAsync(partitionKey, query, ct);

    public Task<OrderDocument?> SaveIfUnchangedAsync(OrderDocument entity, string partitionKey, CancellationToken ct = default)
    {
        if (FailWrites) throw new InvalidOperationException("scripted store failure");
        if (ConflictAlways) return Task.FromResult<OrderDocument?>(null);
        if (ConflictOnNextCreate)
        {
            ConflictOnNextCreate = false;
            _conflictReported = true;
            return Task.FromResult<OrderDocument?>(null);
        }
        return inner.SaveIfUnchangedAsync(entity, partitionKey, ct);
    }
}

internal sealed class CheckoutFixture
{
    public FakeCatalog Catalog { get; } = FakeCatalog.WithTheSeed();
    public RecordingPayments Payments { get; } = new();
    public ManualTime Time { get; } = new(Seed.Now);
    public FlakyOrderRepository Repository { get; } = new(new FakeRepository<OrderDocument>(d => d.Id));
    public RecordingEvents Events { get; } = new();
    public OutboxOptions Outbox { get; } = new();
    public CheckoutOptions CheckoutSettings { get; } = new();
    public OutboxSignal Signal { get; } = new();
    public OrderStore Store { get; }
    public OrderEventPublisher Publisher { get; }
    public OutboxRelay Relay { get; }
    public CheckoutService Service { get; }
    public OrderActionService Actions { get; }

    public CheckoutFixture()
    {
        Store = new OrderStore(Repository);
        Publisher = new OrderEventPublisher(Events, Store, Signal, Options.Create(Outbox), NullLogger<OrderEventPublisher>.Instance);
        Relay = new OutboxRelay(Store, Publisher, Signal, Options.Create(Outbox), Time, NullLogger<OutboxRelay>.Instance);
        Service = new CheckoutService(
            Catalog, Store, Payments, new PickupSchedule(Options.Create(new PickupScheduleOptions())), Publisher,
            Options.Create(CheckoutSettings), Time, NullLogger<CheckoutService>.Instance);
        Actions = new OrderActionService(Store, Catalog, Publisher, Time, NullLogger<OrderActionService>.Instance);
    }

    public Task<CheckoutResult> CheckoutAsync(CheckoutRequest? request = null, string? key = null, string customer = "customer-1", bool decline = false) =>
        Service.CheckoutAsync(customer, key ?? Seed.NewKey(), request ?? Seed.Request(), decline);
}

/// <summary>Records every published envelope; can be scripted to fail or to hang, like a broker that is down or slow.</summary>
internal sealed class RecordingEvents : BakeryMarketplace.Eventing.IEventPublisher
{
    private readonly object _gate = new();
    private readonly List<(Guid EventId, string EventType, long Sequence, string AggregateId, string? Traceparent, object Payload)> _published = [];

    public bool Fail { get; set; }

    /// <summary>When set, publishing waits for this to complete (a hung broker).</summary>
    public Task? Hang { get; set; }

    /// <summary>When set, only this event type fails.</summary>
    public string? FailOnlyType { get; set; }

    public IReadOnlyList<(Guid EventId, string EventType, long Sequence, string AggregateId, string? Traceparent, object Payload)> Published
    {
        get
        {
            lock (_gate) return _published.ToList();
        }
    }

    public async Task PublishAsync<T>(BakeryMarketplace.Eventing.DomainEventEnvelope<T> envelope, CancellationToken ct = default)
    {
        if (Hang is not null) await Hang;
        if (Fail || FailOnlyType == envelope.EventType) throw new InvalidOperationException("scripted broker failure");
        lock (_gate)
        {
            _published.Add((envelope.EventId, envelope.EventType, envelope.SequenceNumber, envelope.AggregateId, envelope.Traceparent, envelope.Payload!));
        }
    }
}
