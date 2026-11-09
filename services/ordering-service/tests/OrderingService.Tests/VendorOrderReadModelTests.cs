using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using OrderingService.Domain;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary><c>N-03</c> and WI-QUE-001 (register item 76): the vendor order read model, fed by the order events. The projection, the list and the lookup.</summary>
public class VendorOrderProjectionTests
{
    private const string Order = "order-1";
    private const string Vendor = "vendor-1";
    private const string Customer = "customer-1";
    private static readonly DateTimeOffset T0 = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeRepository<VendorOrderDocument> _documents = new(d => d.Id);
    private readonly VendorOrderProjection _projection;

    public VendorOrderProjectionTests() => _projection = new VendorOrderProjection(_documents, NullLogger<VendorOrderProjection>.Instance, new InMemoryBroadcast());

    private static DomainEventEnvelope<T> Env<T>(string type, long sequence, int minute, T payload) =>
        new(Guid.NewGuid(), type, 1, T0.AddMinutes(minute), "Order", Order, sequence, payload);

    private Task Placed(long seq = 1, int minute = 0, string? orderId = null) =>
        _projection.OnPlacedAsync(Env(OrderEventTypes.Placed, seq, minute, new OrderPlacedPayload(
            orderId ?? Order, Customer, Vendor, [new LineItemPayload("l1", [], 2), new LineItemPayload("l2", [], 1)], 2400, "USD")), default);

    private Task Confirmed(long seq = 2, int minute = 1, bool automatic = false) =>
        _projection.OnConfirmedAsync(Env(OrderEventTypes.Confirmed, seq, minute, new OrderConfirmedPayload(
            Order, FulfillmentType.Pickup, FulfillmentDetails.ForPickup(T0.AddHours(2), T0.AddHours(2).AddMinutes(15)), automatic, Vendor, Customer)), default);

    private Task Prepared(long seq = 3, int minute = 2) =>
        _projection.OnPreparationStartedAsync(Env(OrderEventTypes.PreparationStarted, seq, minute, new OrderPreparationStartedPayload(Order, Vendor, Customer)), default);

    private async Task<VendorOrderDocument> Read() => (await _documents.GetAsync(Order, Vendor))!;

    [Fact]
    public async Task APlacedOrderAppearsWithItsTotalsAndTheCustomerForTheLookup()
    {
        await Placed();

        var doc = await Read();

        Assert.Equal(OrderStatus.Placed, doc.Status);
        Assert.Equal((2400L, "USD", 2, 3), (doc.TotalCents, doc.Currency, doc.LineCount, doc.ItemCount));
        Assert.Equal(Customer, doc.CustomerId);
        Assert.Equal(T0, doc.PlacedAt);
        Assert.Equal(1, doc.LastSequence);
    }

    [Fact]
    public async Task APlacedOrderCarriesItsLinesAndItsRequestedWindowSoTheVendorCanDecideWithoutASecondRead()
    {
        var start = T0.AddHours(3);
        await _projection.OnPlacedAsync(Env(OrderEventTypes.Placed, 1, 0, new OrderPlacedPayload(
            Order, Customer, Vendor,
            [new LineItemPayload("listing-a", ["mod-seeds", "mod-sliced"], 2), new LineItemPayload("listing-b", [], 1)],
            2400, "USD", FulfillmentType.Pickup,
            new FulfillmentDetails(FulfillmentType.Pickup, new PickupFulfillmentDetails(start, start.AddMinutes(15), "Ring the side bell")))), default);

        var doc = await Read();

        Assert.Equal(OrderStatus.Placed, doc.Status);
        Assert.Equal((start, start.AddMinutes(15), "Ring the side bell"), (doc.PickupStart!.Value, doc.PickupEnd!.Value, doc.PickupInstructions));
        Assert.Equal(["listing-a", "listing-b"], doc.Lines!.Select(l => l.ListingId));
        Assert.Equal(["mod-seeds", "mod-sliced"], doc.Lines![0].ModifierIds);
        Assert.Equal([2, 1], doc.Lines.Select(l => l.Quantity));
    }

    [Fact]
    public async Task AnOrderWithoutARequestedWindowHasNoneAndConfirmingDoesNotBlankOneThatWasRecorded()
    {
        await Placed(); // the helper requests no window
        Assert.Null((await Read()).PickupStart);
        await Confirmed(); // the confirmation brings the scheduled window
        var start = (await Read()).PickupStart;
        await _projection.OnConfirmedAsync(Env(OrderEventTypes.Confirmed, 2, 1, new OrderConfirmedPayload(Order, null, null, false, Vendor, Customer)), default);

        Assert.NotNull(start);
        Assert.Equal(start, (await Read()).PickupStart);
    }

    [Fact]
    public async Task EachLaterEventMovesTheStatusAndConfirmedBringsThePickupWindow()
    {
        await Placed();
        await Confirmed(automatic: true);
        await Prepared();

        var doc = await Read();

        Assert.Equal(OrderStatus.InPreparation, doc.Status);
        Assert.True(doc.Automatic);
        Assert.Equal(FulfillmentType.Pickup, doc.FulfillmentType);
        Assert.Equal((T0.AddHours(2), T0.AddHours(2).AddMinutes(15)), (doc.PickupStart!.Value, doc.PickupEnd!.Value));
        Assert.Equal(3, doc.LastSequence);
        Assert.Equal(T0.AddMinutes(2), doc.UpdatedAt);
    }

    [Fact]
    public async Task AnEventDeliveredTwiceChangesNothing()
    {
        await Placed();
        await Confirmed();
        await Prepared();
        var once = await Read();

        await Placed();
        await Confirmed();
        await Prepared();

        var twice = await Read();
        Assert.Equal(OrderStatus.InPreparation, twice.Status);
        Assert.Equal((once.LastSequence, once.UpdatedAt, once.TotalCents, once.PickupStart), (twice.LastSequence, twice.UpdatedAt, twice.TotalCents, twice.PickupStart));
    }

    [Fact]
    public async Task EventsThatArriveOutOfOrderEndInTheSameStateAsInOrder()
    {
        await Prepared();       // sequence 3 first
        await Confirmed();      // then 2: its facts are recorded, the status stays
        await Placed();         // then 1: the totals are recorded, the status stays

        var doc = await Read();

        Assert.Equal(OrderStatus.InPreparation, doc.Status);
        Assert.Equal(3, doc.LastSequence);
        Assert.Equal((2400L, 2, T0), (doc.TotalCents, doc.LineCount, doc.PlacedAt));
        Assert.NotNull(doc.PickupStart);
        Assert.Equal(Customer, doc.CustomerId);
    }

    [Fact]
    public async Task ACancellationRecordsWhoAndWhy()
    {
        await Placed();
        await _projection.OnCancelledAsync(Env(OrderEventTypes.Cancelled, 2, 3,
            new OrderCancelledPayload(Order, OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined, Vendor, Customer)), default);

        var doc = await Read();

        Assert.Equal(OrderStatus.Cancelled, doc.Status);
        Assert.Equal((OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined), (doc.CancelledBy!.Value, doc.CancelReason!.Value));
    }

    [Fact]
    public async Task AnEventWithoutAVendorIdFindsItsOrderThroughTheReadModelAndIsSkippedIfNoneKnowsIt()
    {
        await Placed();
        await _projection.OnPreparationStartedAsync(Env(OrderEventTypes.PreparationStarted, 2, 1, new OrderPreparationStartedPayload(Order)), default);
        await _projection.OnPreparationStartedAsync(
            Env(OrderEventTypes.PreparationStarted, 2, 1, new OrderPreparationStartedPayload("order-unknown")), default);

        Assert.Equal(OrderStatus.InPreparation, (await Read()).Status);
        Assert.Null(await _documents.GetAsync("order-unknown", Vendor));
    }

    [Fact]
    public async Task APlacedOrderIsListedNewestChangeFirstFilteredByStatusAndPagedByCursor()
    {
        for (var i = 1; i <= 5; i++)
        {
            await Placed(orderId: $"order-{i}", minute: i);
        }
        await _projection.OnConfirmedAsync(Env(OrderEventTypes.Confirmed, 2, 10,
            new OrderConfirmedPayload("order-2", FulfillmentType.Pickup, null, false, Vendor, Customer)), default);
        await _projection.OnCancelledAsync(Env(OrderEventTypes.Cancelled, 2, 11,
            new OrderCancelledPayload("order-4", OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, Vendor, Customer)), default);
        var reader = new VendorOrderReader(_documents);

        var all = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus(null)!, 10, null);
        var active = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus("active")!, 10, null);
        var cancelled = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus("cancelled")!, 10, null);
        var first = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus(null)!, 2, null);
        var second = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus(null)!, 2, first.NextCursor);
        var third = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus(null)!, 2, second.NextCursor);

        Assert.Equal(["order-4", "order-2", "order-5", "order-3", "order-1"], all.Items.Select(i => i.Id));
        Assert.Equal(["order-2", "order-5", "order-3", "order-1"], active.Items.Select(i => i.Id));
        Assert.Equal(["order-4"], cancelled.Items.Select(i => i.Id));
        Assert.Equal(["order-4", "order-2"], first.Items.Select(i => i.Id));
        Assert.Equal(["order-5", "order-3"], second.Items.Select(i => i.Id));
        Assert.Equal(["order-1"], third.Items.Select(i => i.Id));
        Assert.Null(third.NextCursor);
    }

    [Fact]
    public async Task AVendorSeesOnlyTheirOwnPartition()
    {
        await Placed();
        await _projection.OnPlacedAsync(Env(OrderEventTypes.Placed, 1, 0, new OrderPlacedPayload("order-9", "customer-2", "vendor-2", [], 100, "USD")), default);
        var reader = new VendorOrderReader(_documents);

        var mine = await reader.ListAsync(Vendor, VendorOrderReader.ParseStatus(null)!, 10, null);

        Assert.Equal([Order], mine.Items.Select(i => i.Id));
    }

    private sealed class CountingOrders(IRepository<OrderDocument> inner) : IRepository<OrderDocument>
    {
        public int AcrossPartitions { get; private set; }

        public Task<OrderDocument?> GetAsync(string id, string partitionKey, CancellationToken ct = default) => inner.GetAsync(id, partitionKey, ct);
        public Task<OrderDocument> SaveAsync(OrderDocument entity, string partitionKey, CancellationToken ct = default) => inner.SaveAsync(entity, partitionKey, ct);
        public Task<OrderDocument?> SaveIfUnchangedAsync(OrderDocument entity, string partitionKey, CancellationToken ct = default) => inner.SaveIfUnchangedAsync(entity, partitionKey, ct);
        public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default) => inner.DeleteAsync(id, partitionKey, ct);

        public IAsyncEnumerable<OrderDocument> QueryAsync(string partitionKey, Func<IQueryable<OrderDocument>, IQueryable<OrderDocument>> query, CancellationToken ct = default)
        {
            if (partitionKey.Length == 0) AcrossPartitions++;
            return inner.QueryAsync(partitionKey, query, ct);
        }
    }

    [Fact]
    public async Task TheVendorLookupUsesTwoPointReadsWhenTheReadModelHasTheOrderAndTheOldQueryWhenItDoesNot()
    {
        var orders = new CountingOrders(new FakeRepository<OrderDocument>(d => d.Id));
        var store = new OrderStore(orders, _documents);
        var order = Domain.Order.Create(Order, Customer, Vendor, FulfillmentType.Pickup, T0);
        order.AddLine(new OrderLine("l1", [], 1, 800), T0.AddMinutes(1));
        order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(T0.AddHours(2), T0.AddHours(2).AddMinutes(15)), T0.AddMinutes(2));
        order.Place(T0.AddMinutes(3));
        await store.TryCreateAsync(order, "key-1", "fp-1");
        await Placed();

        var fast = await store.GetForVendorAsync(Order, Vendor);
        var acrossAfterFast = orders.AcrossPartitions;
        await _documents.DeleteAsync(Order, Vendor);
        var slow = await store.GetForVendorAsync(Order, Vendor);

        Assert.Equal(Order, fast!.Order.Id);
        Assert.Equal(0, acrossAfterFast);
        Assert.Equal(Order, slow!.Order.Id);
        Assert.Equal(1, orders.AcrossPartitions);
        Assert.Null(await new OrderStore(orders, _documents).GetForVendorAsync(Order, "vendor-other"));
    }

    [Theory]
    [InlineData("order-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d", "3B4C5D")]
    [InlineData("order-ffffff000000", "000000")]
    [InlineData("abc", "ABC")]
    [InlineData("", "")]
    public void TheShortReferenceIsTheLastSixCharactersOfTheIdInUpperCase(string orderId, string expected) =>
        Assert.Equal(expected, OrderReference.For(orderId));

    [Theory]
    [InlineData(null, true)]
    [InlineData("active", true)]
    [InlineData("Completed", true)]
    [InlineData("cancelled", true)]
    [InlineData("Pending", false)]
    [InlineData("nonsense", false)]
    [InlineData("7", false)]
    public void OnlyKnownStatusFiltersAreAccepted(string? status, bool valid) =>
        Assert.Equal(valid, VendorOrderReader.ParseStatus(status) is not null);

    [Theory]
    [InlineData(null, true)]
    [InlineData("1730462400000:order-1", true)]
    [InlineData("order-1", false)]
    [InlineData(":order-1", false)]
    [InlineData("12:", false)]
    [InlineData("x:order-1", false)]
    public void OnlyACursorFromAPreviousPageIsAccepted(string? after, bool valid) =>
        Assert.Equal(valid, VendorOrderReader.IsValidCursor(after));
}

/// <summary>The whole path over HTTP: checkout and vendor actions raise events, the subscriber applies them, the vendor lists and acts.</summary>
public sealed class VendorOrderApiTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;
    private HttpClient _customer = null!;
    private HttpClient _vendor = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret);
        _customer = _factory.CustomerClient("customer-1");
        _vendor = _factory.ClientWithRole(Seed.Vendor, "Vendor");
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _customer.Dispose();
        _vendor.Dispose();
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    private async Task<string> PlaceOrderAsync(HttpClient? customer = null)
    {
        var response = await PostCheckout(customer ?? _customer, new
        {
            vendorId = Seed.Vendor,
            paymentMethodId = "pm-ok",
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
            pickupWindow = new { start = Seed.WindowStart, end = Seed.WindowEnd },
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await JsonOf(response)).GetProperty("id").GetString()!;
    }

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private async Task<JsonElement> ListAsync(string query = "", HttpClient? client = null)
    {
        var response = await (client ?? _vendor).GetAsync("/ordering/vendor/orders" + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonOf(response);
    }

    private static string[] Ids(JsonElement page) => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!).ToArray();

    [Fact]
    public async Task AnOrderTheCustomerPlacesAppearsInTheVendorsListAndFollowsTheVendorsActions()
    {
        var id = await PlaceOrderAsync();

        var placed = (await ListAsync()).GetProperty("items")[0];
        Assert.Equal(id, placed.GetProperty("id").GetString());
        Assert.Equal("Placed", placed.GetProperty("status").GetString());
        Assert.False(placed.TryGetProperty("customerId", out _)); // the vendor needs the order, not who placed it

        Assert.Equal(HttpStatusCode.OK, (await _vendor.PostAsync($"/ordering/orders/{id}/confirm", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _vendor.PostAsync($"/ordering/orders/{id}/start-preparation", null)).StatusCode);

        var now = (await ListAsync("?status=active")).GetProperty("items")[0];
        Assert.Equal("InPreparation", now.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Object, now.GetProperty("pickupWindow").ValueKind);
    }

    [Fact]
    public async Task APlacedOrderInTheListShowsWhatWasOrderedAndTheRequestedWindowBeforeAnyDecision()
    {
        await PlaceOrderAsync(); // a modifier and a window: it waits for the vendor

        var item = (await ListAsync()).GetProperty("items")[0];

        Assert.Equal("Placed", item.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Object, item.GetProperty("pickupWindow").ValueKind);
        var line = Assert.Single(item.GetProperty("lines").EnumerateArray());
        Assert.Equal("listing-sourdough-001", line.GetProperty("listingId").GetString());
        Assert.Equal(2, line.GetProperty("quantity").GetInt32());
        // The ids from the event, with the names the ordering service holds (read from the catalog once, through the real gateway).
        Assert.Equal("Country Sourdough", line.GetProperty("listingName").GetString());
        var modifier = Assert.Single(line.GetProperty("modifiers").EnumerateArray());
        Assert.Equal(("mod-seeds", "Seed crust"), (modifier.GetProperty("id").GetString(), modifier.GetProperty("name").GetString()));
    }

    private int ListingReadsSoFar() => _catalog.Requests.Count(r => r.Method == "GET" && r.Path.StartsWith("/catalog/listings/", StringComparison.Ordinal));

    [Fact]
    public async Task ThreeOrdersOfTheSameListingCostOneNameReadAndLaterListsCostNone()
    {
        await PlaceOrderAsync();
        await PlaceOrderAsync();
        await PlaceOrderAsync();
        var afterCheckouts = ListingReadsSoFar(); // checkout reads the listing for its own price check

        var first = await ListAsync();
        var afterFirstList = ListingReadsSoFar();
        await ListAsync();
        await _vendor.GetAsync($"/ordering/vendor/orders/{first.GetProperty("items")[0].GetProperty("id").GetString()}");
        var afterMore = ListingReadsSoFar();

        Assert.Equal(3, first.GetProperty("items").GetArrayLength());
        Assert.Equal(afterCheckouts + 1, afterFirstList); // one read for the one listing, not one per order
        Assert.Equal(afterFirstList, afterMore);
        Assert.All(first.GetProperty("items").EnumerateArray(), i => Assert.Equal("Country Sourdough", i.GetProperty("lines")[0].GetProperty("listingName").GetString()));
    }

    [Fact]
    public async Task TheListStillWorksWithIdsWhenTheCatalogCannotBeAskedForNames()
    {
        await PlaceOrderAsync();
        _catalog.ListingStatus = 500; // the catalog is failing from now on

        var response = await _vendor.GetAsync("/ordering/vendor/orders");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var line = (await JsonOf(response)).GetProperty("items")[0].GetProperty("lines")[0];
        Assert.Equal("listing-sourdough-001", line.GetProperty("listingId").GetString());
        Assert.Equal(JsonValueKind.Null, line.GetProperty("listingName").ValueKind);
        Assert.Null(line.GetProperty("modifiers")[0].GetProperty("name").GetString());
        Assert.Equal("mod-seeds", line.GetProperty("modifiers")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task AVendorReadsOneOfTheirOrdersAndAnotherVendorOrAnUnknownIdGetsNotFound()
    {
        var id = await PlaceOrderAsync();
        using var other = _factory.ClientWithRole("vendor-other", "Vendor");

        var own = await _vendor.GetAsync($"/ordering/vendor/orders/{id}");

        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        var body = await JsonOf(own);
        Assert.Equal(id, body.GetProperty("id").GetString());
        Assert.Equal(OrderReference.For(id), body.GetProperty("reference").GetString());
        Assert.Equal(1, body.GetProperty("lines").GetArrayLength());
        Assert.False(body.TryGetProperty("customerId", out _));
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _vendor.GetAsync("/ordering/vendor/orders/order-nope")).StatusCode);
    }

    [Fact]
    public async Task OnlyAVendorMayReadOneOrder()
    {
        var id = await PlaceOrderAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _customer.GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientWithRole("admin-1", "Admin").GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
    }

    [Fact]
    public async Task ThePageIsNewestFirstAndAnotherVendorsListIsEmpty()
    {
        var first = await PlaceOrderAsync();
        var second = await PlaceOrderAsync();
        using var other = _factory.ClientWithRole("vendor-other", "Vendor");

        var mine = await ListAsync();
        var theirs = await ListAsync(client: other);

        Assert.Equal(new[] { first, second }.Order(), Ids(mine).Order());
        Assert.Empty(Ids(theirs));
    }

    [Fact]
    public async Task OnlyAVendorMayList()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/ordering/vendor/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _customer.GetAsync("/ordering/vendor/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientWithRole("admin-1", "Admin").GetAsync("/ordering/vendor/orders")).StatusCode);
    }

    [Theory]
    [InlineData("?status=Pending")]
    [InlineData("?status=nonsense")]
    [InlineData("?after=not-a-cursor")]
    public async Task AnInvalidQueryIsRefusedWithTheStandardBody(string query)
    {
        var response = await _vendor.GetAsync("/ordering/vendor/orders" + query);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("validation_failed", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task AVendorActionFindsTheOrderThroughTheReadModelAndAnotherVendorNeverDoes()
    {
        var id = await PlaceOrderAsync();
        var orders = _factory.Services.GetRequiredService<OrderStore>();

        var stored = await orders.GetForVendorAsync(id, Seed.Vendor);

        Assert.NotNull(stored);
        Assert.Equal(id, stored.Order.Id);
        Assert.Null(await orders.GetForVendorAsync(id, "vendor-other"));
    }

    [Fact]
    public async Task AnOrderTheReadModelHasNotSeenYetIsStillFoundByTheOldQuery()
    {
        var id = await PlaceOrderAsync();
        var readModel = _factory.Services.GetRequiredService<IRepository<VendorOrderDocument>>();
        await readModel.DeleteAsync(id, Seed.Vendor); // as if its events had not been applied yet

        var stored = await _factory.Services.GetRequiredService<OrderStore>().GetForVendorAsync(id, Seed.Vendor);

        Assert.NotNull(stored);
        Assert.Equal(HttpStatusCode.OK, (await _vendor.PostAsync($"/ordering/orders/{id}/confirm", null)).StatusCode);
    }
}
