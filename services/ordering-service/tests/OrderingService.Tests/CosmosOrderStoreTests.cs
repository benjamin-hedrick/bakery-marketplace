using BakeryMarketplace.Data;
using BakeryMarketplace.EventSchemas;
using Microsoft.Azure.Cosmos;
using OrderingService.Domain;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

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
/// WI-ORD-006 on the real Cosmos SDK: the document round-trips through Cosmos' own serializer in an <c>orders</c> container partitioned by
/// <c>/customerId</c>, and the ETag guards updates.
/// </summary>
public sealed class CosmosOrderStoreTests : IAsyncLifetime
{
    private CosmosClient? _client;
    private OrderStore? _store;
    private readonly string _database = "orders-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway, // the emulator only works over the gateway
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        var container = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("orders", "/customerId"))).Container;
        _store = new OrderStore(new CosmosRepository<OrderDocument>(container), new FakeRepository<VendorOrderDocument>(d => d.Id));
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    private OrderStore Store => _store ?? throw new InvalidOperationException("Cosmos emulator not configured.");

    [EmulatorFact]
    public async Task EveryStatusRoundTripsThroughRealCosmos()
    {
        foreach (var status in Enum.GetValues<OrderStatus>())
        {
            var order = In(status);
            var id = $"order-{status}";
            var withId = Order.Restore(order.ToSnapshot() with { Id = id });

            Assert.NotNull(await Store.TryCreateAsync(withId, $"key-{status}", "fp"));
            var read = await Store.GetAsync(id, "customer-1");

            Assert.NotNull(read);
            Assert.Equal(withId.ToSnapshot() with { Lines = [] }, read!.Order.ToSnapshot() with { Lines = [] });
            Assert.Equal(withId.Lines, read.Order.Lines);
            Assert.Equal($"key-{status}", read.Document.IdempotencyKey);
        }
    }

    [EmulatorFact]
    public async Task ACreateOfAnExistingOrderFailsAndTheCustomerPartitionScopesReads()
    {
        var order = In(OrderStatus.Placed);
        Assert.NotNull(await Store.TryCreateAsync(order, "key-1", "fp-1"));

        Assert.Null(await Store.TryCreateAsync(In(OrderStatus.Placed), "key-2", "fp-2"));
        Assert.Null(await Store.GetAsync("order-1", "someone-else"));
        Assert.Equal("key-1", (await Store.GetAsync("order-1", "customer-1"))!.Document.IdempotencyKey); // the first create is what stayed
    }

    [EmulatorFact]
    public async Task ContendingConfirmsOnTheRealStoreLetExactlyOneWin()
    {
        await Store.TryCreateAsync(In(OrderStatus.Placed), "key-1", "fp-1");

        async Task<bool> TryConfirm()
        {
            for (var attempt = 0; attempt < 100; attempt++)
            {
                var current = (await Store.GetAsync("order-1", "customer-1"))!;
                if (current.Order.Status != OrderStatus.Placed) return false;
                current.Order.Confirm(At(20));
                if (await Store.TryUpdateAsync(current, current.Order) is not null) return true;
            }
            throw new InvalidOperationException("Too many conflicts.");
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => TryConfirm()));

        Assert.Equal(1, results.Count(won => won));
        Assert.Equal(OrderStatus.Confirmed, (await Store.GetAsync("order-1", "customer-1"))!.Order.Status);
    }
}
