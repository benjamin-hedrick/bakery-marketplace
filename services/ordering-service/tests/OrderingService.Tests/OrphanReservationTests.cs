using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OrderingService.Checkout;
using OrderingService.Persistence;

namespace OrderingService.Tests;

/// <summary>Register item 62: stock reserved for an order that was never saved is released; stock for a real order is not.</summary>
public class OrphanReservationTests
{
    private static ActiveReservation Reserved(string orderId, string vendor = "vendor-1") =>
        new(orderId, vendor, new DateTimeOffset(2026, 11, 1, 10, 0, 0, TimeSpan.Zero));

    private static OrphanReservationSweeper NewSweeper(CheckoutFixture f, OrphanReservationOptions? options = null) =>
        new(f.Catalog, f.Store, Options.Create(options ?? new OrphanReservationOptions()), NullLogger<OrphanReservationSweeper>.Instance);

    [Fact]
    public async Task AReservationWithNoOrderIsReleasedAndOneWithAnOrderIsLeftAlone()
    {
        var f = new CheckoutFixture();
        var placed = await f.CheckoutAsync();
        var realOrderId = placed.Order!.Order.Id;
        f.Catalog.ActiveReservations.Add(Reserved(realOrderId));
        f.Catalog.ActiveReservations.Add(Reserved("order-never-saved"));
        f.Catalog.ReservedOrders.Add("order-never-saved");
        f.Catalog.ReleaseCalls.Clear();

        var result = await NewSweeper(f).SweepOnceAsync(default);

        Assert.Equal((2, 1), result);
        Assert.Equal(["order-never-saved"], f.Catalog.ReleaseCalls);
        Assert.Contains(realOrderId, f.Catalog.ReservedOrders); // the real order keeps its stock
    }

    [Fact]
    public async Task TheSweepAsksForTheConfiguredWindowAndFollowsEveryPage()
    {
        var f = new CheckoutFixture();
        for (var i = 1; i <= 5; i++) f.Catalog.ActiveReservations.Add(Reserved($"order-{i}"));
        var options = new OrphanReservationOptions { MinAgeMinutes = 20, MaxAgeHours = 12, PageSize = 2 };

        var result = await NewSweeper(f, options).SweepOnceAsync(default);

        Assert.Equal((5, 5), result);
        Assert.Equal(3, f.Catalog.ListCalls.Count); // 2 + 2 + 1
        Assert.All(f.Catalog.ListCalls, c => Assert.Equal((TimeSpan.FromMinutes(20), TimeSpan.FromHours(12)), c));
        Assert.Equal(["order-1", "order-2", "order-3", "order-4", "order-5"], f.Catalog.ReleaseCalls);
    }

    [Fact]
    public async Task ASecondSweepFindsNothingLeftToRelease()
    {
        var f = new CheckoutFixture();
        f.Catalog.ActiveReservations.Add(Reserved("order-never-saved"));
        var sweeper = NewSweeper(f);

        await sweeper.SweepOnceAsync(default);
        var again = await sweeper.SweepOnceAsync(default);

        Assert.Equal((0, 0), again);
        Assert.Single(f.Catalog.ReleaseCalls);
    }

    [Fact]
    public async Task ACatalogOutageEndsTheSweepWithoutReleasingAnythingAndTheNextSweepRecovers()
    {
        var f = new CheckoutFixture();
        f.Catalog.ActiveReservations.Add(Reserved("order-never-saved"));
        var sweeper = NewSweeper(f);
        f.Catalog.ListFails = true;

        await Assert.ThrowsAsync<DownstreamUnavailableException>(() => sweeper.SweepOnceAsync(default));
        f.Catalog.ListFails = false;
        var recovered = await sweeper.SweepOnceAsync(default);

        Assert.Equal((1, 1), recovered);
    }

    [Fact]
    public async Task AFailedReleaseEndsTheSweepAndIsRetriedNextTime()
    {
        var f = new CheckoutFixture();
        f.Catalog.ActiveReservations.Add(Reserved("order-never-saved"));
        f.Catalog.ReservedOrders.Add("order-never-saved");
        var sweeper = NewSweeper(f);
        f.Catalog.ReleaseFails = true;

        await Assert.ThrowsAsync<DownstreamUnavailableException>(() => sweeper.SweepOnceAsync(default));
        f.Catalog.ReleaseFails = false;
        f.Catalog.ReleaseCalls.Clear();
        var recovered = await sweeper.SweepOnceAsync(default);

        Assert.Equal((1, 1), recovered);
        Assert.DoesNotContain("order-never-saved", f.Catalog.ReservedOrders);
    }

    [Fact]
    public async Task TheStoreFindsAnOrderByIdForAnyCustomerAndNothingForAnUnknownId()
    {
        var f = new CheckoutFixture();
        var a = await f.CheckoutAsync(customer: "customer-a");
        var b = await f.CheckoutAsync(customer: "customer-b");

        Assert.True(await f.Store.ExistsAsync(a.Order!.Order.Id));
        Assert.True(await f.Store.ExistsAsync(b.Order!.Order.Id));
        Assert.False(await f.Store.ExistsAsync("order-unknown"));
    }
}

/// <summary>The real <see cref="CatalogGateway"/> and service-token handler against a real HTTP server: the list call's path, token and parsing.</summary>
public sealed class OrphanReservationGatewayTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    [Fact]
    public async Task TheListCallAsksForTheWindowAndPageWithTheServiceTokenAndReadsTheAnswer()
    {
        _catalog.ListBody = new
        {
            items = new[] { new { orderId = "order-1", vendorId = "vendor-1", createdAt = "2026-11-01T10:00:00+00:00" } },
            nextCursor = "order-1",
        };
        var gateway = _factory.Services.GetRequiredService<ICatalogGateway>();

        var page = await gateway.ListActiveReservationsAsync(TimeSpan.FromMinutes(15), TimeSpan.FromHours(24), 50, "order-0");

        var item = Assert.Single(page.Items);
        Assert.Equal(("order-1", "vendor-1"), (item.OrderId, item.VendorId));
        Assert.Equal("order-1", page.NextCursor);
        var request = Assert.Single(_catalog.To("GET", "/catalog/stock/reservations"));
        Assert.Equal("/catalog/stock/reservations?state=Active&olderThanMinutes=15&newerThanHours=24&limit=50&after=order-0", request.Path);
        Assert.Equal($"Bearer {FakeCatalogServer.ServiceToken}", request.Authorization);
    }
}
