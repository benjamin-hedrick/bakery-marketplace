using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using OrderingService.Domain;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>WI-ORD-006: orders round-trip through the stored document with every field, and are stored safely.</summary>
public class OrderPersistenceTests
{
    private static OrderStore NewStore() => new(new FakeRepository<OrderDocument>(d => d.Id));

    private static void AssertSameOrder(Order expected, Order actual)
    {
        var e = expected.ToSnapshot();
        var a = actual.ToSnapshot();
        Assert.Equal(e with { Lines = [] }, a with { Lines = [] });
        Assert.Equal(e.Lines.Count, a.Lines.Count);
        for (var i = 0; i < e.Lines.Count; i++) Assert.Equal(e.Lines[i], a.Lines[i]);
        Assert.Equal(expected.TotalCents, actual.TotalCents);
    }

    public static IEnumerable<object[]> EveryStatus() => Enum.GetValues<OrderStatus>().Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(EveryStatus))]
    public void AnOrderInAnyStatusSurvivesTheSnapshot(OrderStatus status)
    {
        var order = In(status);

        var restored = Order.Restore(order.ToSnapshot());

        AssertSameOrder(order, restored);
        Assert.Empty(restored.DequeueEvents()); // restoring raises nothing
    }

    [Theory]
    [MemberData(nameof(EveryStatus))]
    public void AnOrderInAnyStatusSurvivesTheStoredDocumentAsJson(OrderStatus status)
    {
        var order = In(status);

        // The JSON round trip is what Cosmos does with the document (Newtonsoft).
        var json = JsonConvert.SerializeObject(OrderDocument.From(order, "key-1", "fp-1"));
        var restored = JsonConvert.DeserializeObject<OrderDocument>(json)!.ToOrder();

        AssertSameOrder(order, restored);
    }

    [Fact]
    public void TheDocumentUsesTheNamesAndValuesCosmosAndReadersExpect()
    {
        var order = In(OrderStatus.Cancelled);

        var json = JObject.Parse(JsonConvert.SerializeObject(OrderDocument.From(order, "key-1", "fp-1")));

        Assert.Equal("order-1", (string?)json["id"]);
        Assert.Equal("customer-1", (string?)json["customerId"]); // the partition key path
        Assert.Equal("Cancelled", (string?)json["status"]); // readable, not a number
        Assert.Equal("Pickup", (string?)json["fulfillmentType"]);
        Assert.Equal("Customer", (string?)json["cancelledBy"]);
        Assert.Equal("CustomerRequested", (string?)json["cancelReason"]);
        Assert.Equal(1800L, (long?)json["totalCents"]);
        Assert.Equal("USD", (string?)json["currency"]);
        Assert.Equal("Front counter", (string?)json["pickup"]!["instructions"]);
        Assert.Equal(new[] { "mod-seeds" }, json["lines"]![0]!["modifierIds"]!.Select(x => (string?)x));
        Assert.Null(json["_etag"]); // not sent when unset
        Assert.Null(json["delivery"]);
    }

    [Fact]
    public void AnOrderWithNoWindowAndNoCancellationOmitsThoseFields()
    {
        var order = In(OrderStatus.Placed);

        var json = JObject.Parse(JsonConvert.SerializeObject(OrderDocument.From(Order.Restore(order.ToSnapshot() with { Fulfillment = null }))));

        Assert.Null(json["pickup"]);
        Assert.Null(json["cancelledBy"]);
        Assert.Null(json["idempotencyKey"]);
    }

    [Fact]
    public void CorruptStoredStateIsRefusedLoudly()
    {
        var good = OrderDocument.From(In(OrderStatus.Placed));

        void Bad(Action<OrderDocument> corrupt, string because)
        {
            var doc = JsonConvert.DeserializeObject<OrderDocument>(JsonConvert.SerializeObject(good))!;
            corrupt(doc);
            Assert.True(Assert.Throws<OrderRuleException>(doc.ToOrder) is not null, because);
        }

        Bad(d => d.Status = (OrderStatus)99, "unknown status");
        Bad(d => d.Lines.Clear(), "placed with no lines");
        Bad(d => d.SequenceNumber = 0, "placed but no events");
        Bad(d => d.CancelledBy = OrderCancelActor.Vendor, "cancellation details on an order that is not cancelled");
        Bad(d => d.Delivery = new DeliveryDocument("1 Main St", null, null, null), "both pickup and delivery");
        Bad(d => d.Lines[0].Quantity = 0, "an impossible quantity");
        Bad(d => d.CustomerId = "", "no customer");
    }

    // ---- the store ---------------------------------------------------------------------------

    [Fact]
    public async Task CreateThenGetRoundTripsTheOrder_AndKeepsTheIdempotencyData()
    {
        var store = NewStore();
        var order = In(OrderStatus.Placed);

        var created = await store.TryCreateAsync(order, "key-1", "fp-1");
        var read = await store.GetAsync("order-1", "customer-1");

        Assert.NotNull(created);
        Assert.NotNull(read);
        AssertSameOrder(order, read!.Order);
        Assert.Equal(("key-1", "fp-1"), (read.Document.IdempotencyKey, read.Document.RequestFingerprint));
        Assert.False(string.IsNullOrEmpty(read.Document.ETag));
    }

    [Fact]
    public async Task AnOrderIsOnlyVisibleInItsOwnCustomersPartition()
    {
        var store = NewStore();
        await store.TryCreateAsync(In(OrderStatus.Placed), "key-1", "fp-1");

        Assert.Null(await store.GetAsync("order-1", "customer-2"));
        Assert.Null(await store.GetAsync("order-nope", "customer-1"));
    }

    [Fact]
    public async Task CreatingTheSameOrderTwiceFails_NoMatterHowManyTryAtOnce()
    {
        var store = NewStore();

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => store.TryCreateAsync(In(OrderStatus.Placed), "key-1", "fp-1")));

        Assert.Equal(1, results.Count(r => r is not null));
    }

    [Fact]
    public async Task AnUpdateNeedsTheETagItWasReadWith()
    {
        var store = NewStore();
        await store.TryCreateAsync(In(OrderStatus.Placed), "key-1", "fp-1");
        var first = (await store.GetAsync("order-1", "customer-1"))!;
        var second = (await store.GetAsync("order-1", "customer-1"))!;

        first.Order.Confirm(At(10));
        Assert.NotNull(await store.TryUpdateAsync(first, first.Order));

        second.Order.Confirm(At(11));
        Assert.Null(await store.TryUpdateAsync(second, second.Order)); // lost the race

        var stored = (await store.GetAsync("order-1", "customer-1"))!;
        Assert.Equal(OrderStatus.Confirmed, stored.Order.Status);
        Assert.Equal(At(10), stored.Order.UpdatedAt);
        Assert.Equal(("key-1", "fp-1"), (stored.Document.IdempotencyKey, stored.Document.RequestFingerprint)); // survives updates
    }

    [Fact]
    public async Task ContendingTransitionsOnOneOrderLoseNothing()
    {
        var store = NewStore();
        await store.TryCreateAsync(In(OrderStatus.Placed), "key-1", "fp-1");

        // Ten writers each try to move the order forward one step; only valid, uncontested transitions may land, one at a time.
        async Task<bool> TryAdvance()
        {
            for (var attempt = 0; attempt < 100; attempt++)
            {
                var current = (await store.GetAsync("order-1", "customer-1"))!;
                if (current.Order.Status != OrderStatus.Placed) return false;
                current.Order.Confirm(At(20));
                if (await store.TryUpdateAsync(current, current.Order) is not null) return true;
            }
            throw new InvalidOperationException("Too many conflicts.");
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => TryAdvance()));

        Assert.Equal(1, results.Count(won => won));
        Assert.Equal(OrderStatus.Confirmed, (await store.GetAsync("order-1", "customer-1"))!.Order.Status);
    }
}
