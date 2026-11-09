using System.Net;
using BakeryMarketplace.Chaos;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OrderingService.Domain;
using OrderingService.Outbox;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// ADR-0024 / WI-CHAOS-001 in the real ordering host: a scenario switched on by configuration wraps the real event transport, and the service,
/// its checkout and its outbox are untouched. The scenario is a file; the test names it and so knows exactly which chaos is on.
/// </summary>
public sealed class ChaosHostTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private readonly List<string> _files = [];
    private FakeCatalogServer _catalog = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _catalog.DisposeAsync();
        foreach (var file in _files) File.Delete(file);
    }

    private string Scenario(string json)
    {
        var path = Path.Combine(Path.GetTempPath(), $"chaos-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, json);
        _files.Add(path);
        return path;
    }

    private static object Checkout() => new
    {
        vendorId = Seed.Vendor,
        paymentMethodId = "pm-ok",
        lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
        pickupWindow = new { start = Seed.WindowStart, end = Seed.WindowEnd },
    };

    [Fact]
    public async Task AnOrderPlacedDuringABrokerOutage_IsAccepted_AndItsEventReachesTheBrokerOnceItRecovers()
    {
        var scenario = Scenario("""{ "name": "test-broker-outage", "seed": 1, "layers": { "events": { "outageWindowSeconds": 1.5 } } }""");
        await using var factory = new OrderingFactory(_catalog, _secret, extraSettings: new Dictionary<string, string>
        {
            ["Chaos:Enabled"] = "true",
            ["Chaos:Scenario"] = scenario,
            ["Outbox:GraceSeconds"] = "0", // the test drives the relay's sweep itself
        });
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        var received = new List<DomainEventEnvelope<OrderPlacedPayload>>();
        await factory.Services.GetRequiredService<IEventSubscriber>().SubscribeAsync<OrderPlacedPayload>(OrderEventTypes.Placed, (e, _) =>
        {
            lock (received) received.Add(e);
            return Task.CompletedTask;
        });
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        // The fault happened, in this request, and the response says so; the customer's order is not affected.
        Assert.True(runtime.Journal.Count("events", "outage") >= 1, "the scenario's outage must have hit the inline publish");
        Assert.Equal("test-broker-outage", response.Headers.GetValues(ChaosIndicatorMiddleware.ScenarioHeader).Single());
        Assert.Contains("events:outage", response.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Empty(received); // the broker was down: nothing was delivered yet

        await Task.Delay(1700); // the outage ends; the outbox relay's next sweep sends what the inline publish missed
        var relay = factory.Services.GetServices<IHostedService>().OfType<OutboxRelay>().Single();
        var (found, published) = await relay.SweepOnceAsync(default);

        Assert.True(found >= 1);
        Assert.True(published >= 1);
        var placed = Assert.Single(received);
        Assert.Equal("Order", placed.AggregateType);
        Assert.Equal(1800, placed.Payload.TotalCents);
    }

    [Fact]
    public async Task WithChaosOff_TheRealTransportIsUntouched_AndNoResponseCarriesTheIndicator()
    {
        await using var factory = new OrderingFactory(_catalog, _secret);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.IsType<InMemoryEventTransport>(factory.Services.GetRequiredService<IEventPublisher>());
        Assert.False(factory.Services.GetRequiredService<ChaosRuntime>().Enabled);
        Assert.False(response.Headers.Contains(ChaosIndicatorMiddleware.ScenarioHeader));
    }

    [Fact]
    public void TheHostRefusesToStartWithChaosEnabledOutsideDevelopmentAndTheDevDeployment()
    {
        using var factory = new OrderingFactory(_catalog, _secret, environment: "Production", extraSettings: new Dictionary<string, string>
        {
            ["Chaos:Enabled"] = "true",
            ["Chaos:Scenario"] = "flaky-broker",
        });

        var failure = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Chaos cannot run", failure.ToString());
    }
}
