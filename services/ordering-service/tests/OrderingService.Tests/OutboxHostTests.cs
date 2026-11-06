using System.Net;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Domain;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>WI-ORD-005 in the real host: the wiring in Program.cs, over HTTP.</summary>
public sealed class OutboxHostTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private FakeCatalogServer _catalog = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _catalog.DisposeAsync();

    [Fact]
    public async Task APlacedOrderReachesTheEventBackendThroughTheRealHost()
    {
        await using var factory = new OrderingFactory(_catalog, _secret);
        var received = new List<DomainEventEnvelope<OrderPlacedPayload>>();
        var transport = Assert.IsType<InMemoryEventTransport>(factory.Services.GetRequiredService<IEventPublisher>());
        await transport.SubscribeAsync<OrderPlacedPayload>(OrderEventTypes.Placed, (e, _) =>
        {
            lock (received) received.Add(e);
            return Task.CompletedTask;
        });
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, new
        {
            vendorId = Seed.Vendor,
            paymentMethodId = "pm-ok",
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
            pickupWindow = new { start = Seed.WindowStart, end = Seed.WindowEnd },
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var placed = Assert.Single(received);
        Assert.Equal("Order", placed.AggregateType);
        Assert.Equal(1800, placed.Payload.TotalCents);
        Assert.False(string.IsNullOrEmpty(placed.Traceparent)); // the request's trace context travels with the event (ADR-0016)
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("kafka")]
    public void TheServiceRefusesToStartWithoutAnExplicitEventBackend(string? backend)
    {
        using var factory = new OrderingFactory(_catalog, _secret).WithWebHostBuilder(b => b.UseSetting("Events:Backend", backend));

        var failure = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Events:Backend", failure.ToString());
    }
}
