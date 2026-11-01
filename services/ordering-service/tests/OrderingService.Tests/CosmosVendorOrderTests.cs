using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging.Abstractions;
using OrderingService.Domain;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>
/// The vendor order read model and the outbox parking queries on the real Cosmos SDK (<c>N-03</c>, register items 74 and 76): the stored enum
/// strings, the vendor partition query, conditional saves and the point-read lookup. Skipped unless COSMOS_CONNECTION_STRING is set.
/// </summary>
public sealed class CosmosVendorOrderTests : IAsyncLifetime
{
    private CosmosClient? _client;
    private OrderStore? _store;
    private VendorOrderProjection? _projection;
    private VendorOrderReader? _reader;
    private IRepository<VendorOrderDocument>? _vendorOrders;
    private readonly string _database = "vendororders-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        var orders = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("orders", "/customerId"))).Container;
        var vendorOrders = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("vendor-orders", "/vendorId"))).Container;
        _vendorOrders = new CosmosRepository<VendorOrderDocument>(vendorOrders);
        _store = new OrderStore(new CosmosRepository<OrderDocument>(orders), _vendorOrders);
        _projection = new VendorOrderProjection(_vendorOrders, NullLogger<VendorOrderProjection>.Instance);
        _reader = new VendorOrderReader(_vendorOrders);
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    private static DomainEventEnvelope<T> Env<T>(string type, long sequence, int minute, T payload) =>
        new(Guid.NewGuid(), type, 1, T0.AddMinutes(minute), "Order", "x", sequence, payload);

    [EmulatorFact]
    public async Task TheReadModelProjectsListsFiltersPagesAndFindsTheOrderOnTheRealStore()
    {
        var vendor = "vendor-cosmos";
        foreach (var n in new[] { 1, 2, 3 })
        {
            await _projection!.OnPlacedAsync(Env(OrderEventTypes.Placed, 1, n, new OrderPlacedPayload(
                $"order-{n}", $"customer-{n}", vendor, [new LineItemPayload("l1", [], 2)], 1800, "USD")), default);
        }
        await _projection!.OnConfirmedAsync(Env(OrderEventTypes.Confirmed, 2, 10, new OrderConfirmedPayload(
            "order-2", FulfillmentType.Pickup, FulfillmentDetails.ForPickup(T0.AddHours(2), T0.AddHours(2).AddMinutes(15)), true, vendor, "customer-2")), default);
        await _projection.OnConfirmedAsync(Env(OrderEventTypes.Confirmed, 2, 10, new OrderConfirmedPayload(
            "order-2", FulfillmentType.Pickup, null, true, vendor, "customer-2")), default); // a repeat changes nothing
        await _projection.OnCancelledAsync(Env(OrderEventTypes.Cancelled, 2, 11, new OrderCancelledPayload(
            "order-3", OrderCancelActor.Customer, OrderCancelReason.CustomerRequested, vendor, "customer-3")), default);

        var all = await _reader!.ListAsync(vendor, VendorOrderReader.ParseStatus(null)!, 10, null);
        var confirmed = await _reader.ListAsync(vendor, VendorOrderReader.ParseStatus("confirmed")!, 10, null);
        var first = await _reader.ListAsync(vendor, VendorOrderReader.ParseStatus(null)!, 2, null);
        var second = await _reader.ListAsync(vendor, VendorOrderReader.ParseStatus(null)!, 2, first.NextCursor);
        var otherVendor = await _reader.ListAsync("vendor-other", VendorOrderReader.ParseStatus(null)!, 10, null);

        Assert.Equal(["order-3", "order-2", "order-1"], all.Items.Select(i => i.Id));
        Assert.Equal(["order-2"], confirmed.Items.Select(i => i.Id));
        Assert.Equal(OrderStatus.Confirmed, confirmed.Items[0].Status);
        Assert.True(confirmed.Items[0].Automatic);
        Assert.Equal(T0.AddHours(2), confirmed.Items[0].PickupStart);
        Assert.Equal(OrderCancelReason.CustomerRequested, all.Items[0].CancelReason);
        Assert.Equal(["order-3", "order-2"], first.Items.Select(i => i.Id));
        Assert.Equal(["order-1"], second.Items.Select(i => i.Id));
        Assert.Empty(otherVendor.Items);
        var line = Assert.Single(all.Items[2].Lines!); // the lines round-trip through Cosmos' own serializer
        Assert.Equal(("l1", 2), (line.ListingId, line.Quantity));
    }

    [EmulatorFact]
    public async Task TheVendorLookupFindsTheOrderByTwoPointReadsOnTheRealStore()
    {
        var order = Order.Create("order-lookup", "customer-9", "vendor-cosmos", FulfillmentType.Pickup, T0);
        order.AddLine(Line(), At(1));
        order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(At(60), At(75)), At(2));
        order.Place(At(3));
        await _store!.TryCreateAsync(order, "key-1", "fp-1");
        await _projection!.OnPlacedAsync(Env(OrderEventTypes.Placed, 1, 0, new OrderPlacedPayload(
            "order-lookup", "customer-9", "vendor-cosmos", [new LineItemPayload("l1", [], 1)], 900, "USD")), default);

        var found = await _store.GetForVendorAsync("order-lookup", "vendor-cosmos");
        var other = await _store.GetForVendorAsync("order-lookup", "vendor-other");

        Assert.Equal("customer-9", found!.Order.CustomerId);
        Assert.Null(other);
    }

    [EmulatorFact]
    public async Task ParkingAndTheRelayQueriesWorkOnTheRealStore()
    {
        var order = Order.Create("order-parked", "customer-8", "vendor-cosmos", FulfillmentType.Pickup, T0);
        order.AddLine(Line(), At(1));
        order.SetFulfillmentDetails(FulfillmentDetails.ForPickup(At(60), At(75)), At(2));
        order.Place(At(3));
        var created = (await _store!.TryCreateAsync(order, "key-1", "fp-1"))!;

        var pendingBefore = await _store.FindPendingAsync(At(1000), 10);
        var parked = (await _store.TryRecordFailureAsync(created, created.Document.Outbox[0].EventId, maxAttempts: 1, At(10)))!;
        var pendingAfter = await _store.FindPendingAsync(At(1000), 10);
        var found = await _store.FindParkedAsync(10);
        var unparked = (await _store.TryUnparkAsync((await _store.GetAsync("order-parked", "customer-8"))!))!;

        Assert.Contains(pendingBefore, o => o.Order.Id == "order-parked");
        Assert.NotNull(parked.Document.ParkedAt);
        Assert.DoesNotContain(pendingAfter, o => o.Order.Id == "order-parked");
        Assert.Equal("order-parked", Assert.Single(found).Order.Id);
        Assert.Null(unparked.Document.ParkedAt);
        Assert.Contains(await _store.FindPendingAsync(At(1000), 10), o => o.Order.Id == "order-parked");
    }
}
