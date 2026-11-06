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
            [new("mod-seeds", 100, "Seed crust"), new("mod-sliced", 0, "Sliced")], new CatalogStock("inStock", maxPerOrder));

    public static CatalogListing Croissant() =>
        new("listing-croissant-001", Vendor, "Almond Croissant", 450, "Published", [new("mod-extra-almond", 75)], new CatalogStock("low", null));

    public static CatalogListing Latte() =>
        new("listing-latte-001", Vendor, "Oat Milk Latte", 500, "Published",
            [new("mod-extra-shot", 75), new("mod-vanilla", 50)], new CatalogStock("inStock", null));

    public static CheckoutLineRequest Line(string listingId, int quantity, params string[] modifiers) => new(listingId, [.. modifiers], quantity);

    public static CheckoutRequest Request(IEnumerable<CheckoutLineRequest>? lines = null, bool window = true, string vendor = Vendor, string? method = ValidMethod) => new(
        vendor,
        [.. lines ?? [Line("listing-sourdough-001", 2, "mod-seeds")]],
        window ? new PickupWindowRequest(WindowStart, WindowEnd) : null,
        PaymentMethodId: method);

    public static CheckoutRequest Req(string vendor, List<CheckoutLineRequest> lines, PickupWindowRequest? window) =>
        new(vendor, lines, window, PaymentMethodId: ValidMethod);

    // Every test customer gets two saved methods (see PaymentMethods.For): one whose token passes the validator and one whose token fails it.
    public const string ValidMethod = "pm-ok";
    public const string InvalidMethod = "pm-bad";

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

    /// <summary>When set, listing reads wait for this to complete (to hold many callers on one fetch).</summary>
    public TaskCompletionSource? Gate { get; set; }

    public async Task<CatalogListing?> GetListingAsync(string listingId, CancellationToken ct = default)
    {
        await Task.Yield();
        Interlocked.Increment(ref ListingReads);
        if (Gate is not null) await Gate.Task;
        if (ListingReadsFail) throw new DownstreamUnavailableException("scripted outage");
        return Listings.GetValueOrDefault(listingId);
    }

    /// <summary>The allergens the fake registry offers (the closed list of ADR-0022).</summary>
    public HashSet<string> Allergens { get; } = ["dairy", "egg", "fish", "shellfish", "tree-nut", "peanut", "gluten", "soy", "sesame"];
    public int AllergenReads;
    public bool AllergenReadsFail { get; set; }

    public async Task<IReadOnlyCollection<string>> GetAllergenIdsAsync(CancellationToken ct = default)
    {
        await Task.Yield();
        Interlocked.Increment(ref AllergenReads);
        if (AllergenReadsFail) throw new DownstreamUnavailableException("scripted outage");
        return Allergens.ToList();
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

    /// <summary>Active reservations the fake lists to the orphan sweep, in order id order.</summary>
    public List<ActiveReservation> ActiveReservations { get; } = [];
    public bool ListFails { get; set; }
    public List<(TimeSpan OlderThan, TimeSpan NotOlderThan)> ListCalls { get; } = [];

    public async Task<ActiveReservationPage> ListActiveReservationsAsync(
        TimeSpan olderThan, TimeSpan notOlderThan, int limit, string? after, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate) ListCalls.Add((olderThan, notOlderThan));
        if (ListFails) throw new DownstreamUnavailableException("scripted outage");
        var rest = ActiveReservations
            .Where(r => ReservedOrders.Contains(r.OrderId) || !ReleaseCalls.Contains(r.OrderId))
            .OrderBy(r => r.OrderId, StringComparer.Ordinal)
            .Where(r => after is null || string.CompareOrdinal(r.OrderId, after) > 0)
            .Take(limit + 1)
            .ToList();
        return new ActiveReservationPage(rest.Take(limit).ToList(), rest.Count > limit ? rest[limit - 1].OrderId : null);
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

/// <summary>The saved payment methods the tests give a customer: one with a valid token and one whose token fails <see cref="PaymentTokenValidator"/>.</summary>
internal static class PaymentMethods
{
    public const string ValidToken = "pm_test_valid_token_1";
    public const string InvalidToken = "invalid token";

    public static IEnumerable<PaymentMethodDocument> For(string customerId) =>
    [
        new() { Id = Seed.ValidMethod, CustomerId = customerId, Description = "Test card (accepted)", Token = ValidToken, CreatedAt = Seed.Now },
        new() { Id = Seed.InvalidMethod, CustomerId = customerId, Description = "Test card (refused)", Token = InvalidToken, CreatedAt = Seed.Now.AddSeconds(1) },
    ];

    public static async Task EnsureAsync(IRepository<PaymentMethodDocument> repository, string customerId)
    {
        foreach (var method in For(customerId))
        {
            if (await repository.GetAsync(method.Id, customerId) is null) await repository.SaveAsync(method, customerId);
        }
    }
}

internal sealed class RecordingPayments : IPaymentProcessor
{
    public List<PaymentRequest> Requests { get; } = [];
    private readonly object _gate = new();

    /// <summary>A processor that refuses the authorization (a provider saying no), to prove the checkout cleans up after a refusal that comes after the reservation.</summary>
    public bool Decline { get; set; }

    public async Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
    {
        await Task.Yield();
        lock (_gate) Requests.Add(request);
        return Decline ? new PaymentResult(false) : new PaymentResult(true, "recorded");
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
    public FakeRepository<PaymentMethodDocument> MethodRepository { get; } = new(d => d.Id);
    public PaymentMethodStore Methods { get; }
    public RecordingEvents Events { get; } = new();
    public OutboxOptions Outbox { get; } = new();
    public CheckoutOptions CheckoutSettings { get; } = new();
    public AllergenRegistryOptions AllergenSettings { get; } = new();
    public AllergenRegistry Allergens { get; }
    public OutboxSignal Signal { get; } = new();
    public OrderStore Store { get; }
    public OrderEventPublisher Publisher { get; }
    public OutboxRelay Relay { get; }
    public CheckoutService Service { get; }
    public OrderActionService Actions { get; }

    public CheckoutFixture()
    {
        Store = new OrderStore(Repository);
        Methods = new PaymentMethodStore(MethodRepository);
        Publisher = new OrderEventPublisher(Events, Store, Signal, Options.Create(Outbox), Time, NullLogger<OrderEventPublisher>.Instance);
        Relay = new OutboxRelay(Store, Publisher, Signal, Options.Create(Outbox), Time, NullLogger<OutboxRelay>.Instance);
        Allergens = new AllergenRegistry(Catalog, Options.Create(AllergenSettings), Time);
        Service = new CheckoutService(
            Catalog, Store, Payments, new PickupSchedule(Options.Create(new PickupScheduleOptions())), Methods, Publisher, Allergens,
            Options.Create(CheckoutSettings), Time, NullLogger<CheckoutService>.Instance);
        Actions = new OrderActionService(Store, Catalog, Publisher, Time, NullLogger<OrderActionService>.Instance);
    }

    /// <summary>Gives the customer the two test methods (idempotent) and runs checkout. <c>decline</c> chooses the method whose token is invalid.</summary>
    public async Task<CheckoutResult> CheckoutAsync(CheckoutRequest? request = null, string? key = null, string customer = "customer-1", bool decline = false)
    {
        await PaymentMethods.EnsureAsync(MethodRepository, customer);
        var asked = request ?? Seed.Request();
        if (decline) asked = asked with { PaymentMethodId = Seed.InvalidMethod };
        return await Service.CheckoutAsync(customer, key ?? Seed.NewKey(), asked);
    }
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
