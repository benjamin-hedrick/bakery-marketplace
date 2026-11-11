using System.Net;
using BakeryMarketplace.Chaos;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OrderingService.Checkout;
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

    // ---- phase 2 (WI-CHAOS-002): the payment and catalog layers, in the real host ----

    private OrderingFactory Host(string layersJson, string seed = "1") =>
        new(_catalog, _secret, extraSettings: new Dictionary<string, string>
        {
            ["Chaos:Enabled"] = "true",
            ["Chaos:Scenario"] = Scenario("{ \"name\": \"layers-test\", \"seed\": " + seed + ", \"layers\": " + layersJson + " }"),
        });

    [Fact]
    public async Task ADeclinedPayment_IsAnswered402_TheStockIsReleased_AndTheResponseSaysChaosDeclinedIt()
    {
        await using var factory = Host("""{ "payment": { "declineRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.Equal(1, runtime.Journal.Count("payment", "decline")); // the fault happened
        Assert.Contains("payment:decline", response.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Empty(_catalog.Reservations); // the reservation made before the payment step was given back
    }

    [Fact]
    public async Task AProcessorThatFails_LeavesNoReservationBehind_AndTheCustomerGets503()
    {
        await using var factory = Host("""{ "payment": { "failureRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.Equal(1, runtime.Journal.Count("payment", "failure"));
        Assert.Empty(_catalog.Reservations); // released even though the step threw (the reserved flag in CheckoutService)
        // A processor that cannot be reached is the same answer as a catalog that cannot be reached (register 170): 503 "downstream_unavailable".
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("downstream_unavailable", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ACatalogThatCannotBeReached_IsAnswered503DownstreamUnavailable_AndNothingIsStored()
    {
        await using var factory = Host("""{ "catalog": { "unavailableRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");
        var key = Seed.NewKey();

        var response = await PostCheckout(customer, Checkout(), key);

        Assert.True(runtime.Journal.Count("catalog", "unavailable") >= 1);
        Assert.Contains("catalog:unavailable", response.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("downstream_unavailable", System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("code").GetString());
        Assert.Empty(_catalog.Reservations);
        Assert.Equal(HttpStatusCode.NotFound, (await customer.GetAsync($"/ordering/orders/{OrderingService.Checkout.CheckoutService.OrderIdFor("customer-1", key)}")).StatusCode);
    }

    [Fact]
    public async Task ARefusedReservation_IsAnswered409Conflict()
    {
        await using var factory = Host("""{ "catalog": { "rejectRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.Equal(1, runtime.Journal.Count("catalog", "reject"));
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Empty(_catalog.Reservations);
    }

    [Fact]
    public async Task TheSameScenarioFailsTheSameOrdersOnEveryRun_BecauseTheOrderIdComesFromTheIdempotencyKey()
    {
        var keys = Enumerable.Range(0, 12).Select(i => $"fixed-key-{i}").ToList();

        async Task<string> Run()
        {
            await using var factory = Host("""{ "catalog": { "unavailableRate": 0.5 } }""", seed: "99");
            using var customer = factory.CustomerClient("customer-1");
            var outcome = "";
            foreach (var key in keys)
            {
                var response = await PostCheckout(customer, Checkout(), key);
                outcome += response.StatusCode == HttpStatusCode.Created ? "o" : "x";
            }

            return outcome;
        }

        var first = await Run();
        Assert.Equal(first, await Run());
        Assert.Contains('o', first); // a rate of 0.5 over 12 orders neither always fails nor never fails
        Assert.Contains('x', first);
    }

    [Fact]
    public async Task AStoreThatFails_LeavesNoReservationBehind_AndTheCustomerGets503()
    {
        await using var factory = Host("""{ "repository": { "failureRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.True(runtime.Journal.Count("repository", "failure") >= 1);
        Assert.Contains("repository:failure", response.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.Empty(_catalog.Reservations); // whatever the store did, the reservation was given back
        // A store that cannot be reached is the same answer as a catalog that cannot be reached (register 170).
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    // ---- the ambiguous failure: the work was done, the answer was lost ----

    private sealed class CountingProcessor : IPaymentProcessor
    {
        public int Authorizations;

        public Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
        {
            Interlocked.Increment(ref Authorizations);
            return Task.FromResult(new PaymentResult(true, "ref-" + request.OrderId));
        }
    }

    [Fact]
    public async Task APaymentWhoseResponseIsLost_WasAuthorized_ButTheCustomerIsToldItFailed_AndAReplayAuthorizesAgain()
    {
        var inner = new CountingProcessor();
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("t", 1, "payment", ("lostResponseRate", 1)));
        var chaos = new OrderingService.Chaos.ChaosPaymentProcessor(inner, runtime.Layer("payment"));
        var request = new PaymentRequest("order-1", "customer-1", 900, "USD", "tok");

        await Assert.ThrowsAsync<PaymentUnavailableException>(() => chaos.AuthorizeAsync(request));
        await Assert.ThrowsAsync<PaymentUnavailableException>(() => chaos.AuthorizeAsync(request)); // the customer retries the checkout

        Assert.Equal(2, runtime.Journal.Count("payment", "lostResponse"));
        // Two authorizations for one order: today's processor interface has no idempotency key and no void. A real processor must be called with the
        // order id as its idempotency key, and a failed checkout must void (register 171).
        Assert.Equal(2, inner.Authorizations);
    }

    [Fact]
    public async Task ACheckoutWhosePaymentResponseIsLost_ReleasesTheStock_AndTheCustomerGets503()
    {
        await using var factory = Host("""{ "payment": { "lostResponseRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.Equal(1, runtime.Journal.Count("payment", "lostResponse"));
        Assert.Contains("payment:lostResponse", response.Headers.GetValues(ChaosIndicatorMiddleware.InjectedHeader).Single());
        Assert.Empty(_catalog.Reservations);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode); // register 170
    }

    [Fact]
    public async Task AStoreWriteWhoseResponseIsLost_StoredTheOrder_AndAReplayWithTheSameKeyReturnsIt()
    {
        await using var factory = Host("""{ "repository": { "lostResponseRate": 1 } }""");
        var runtime = factory.Services.GetRequiredService<ChaosRuntime>();
        using var customer = factory.CustomerClient("customer-1");
        var key = Seed.NewKey();
        var orderId = OrderingService.Checkout.CheckoutService.OrderIdFor("customer-1", key);

        var first = await PostCheckout(customer, Checkout(), key);

        Assert.True(runtime.Journal.Count("repository", "lostResponse") >= 1, "the write must have been made and its response lost");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, first.StatusCode); // the customer is told to try again ...
        Assert.Equal(HttpStatusCode.OK, (await customer.GetAsync($"/ordering/orders/{orderId}")).StatusCode); // ... but the order is there

        var replay = await PostCheckout(customer, Checkout(), key); // the customer tries again with the same idempotency key

        Assert.Equal(HttpStatusCode.OK, replay.StatusCode); // answered with the existing order, not a second one
        Assert.Contains(orderId, await replay.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ACatalogReservationWhoseResponseIsLost_IsGivenBack_AndTheCustomerGets503()
    {
        await using var always = Host("""{ "catalog": { "lostResponseRate": 1 } }""");
        var runtime = always.Services.GetRequiredService<ChaosRuntime>();
        using var customer = always.CustomerClient("customer-1");

        var response = await PostCheckout(customer, Checkout());

        Assert.True(runtime.Journal.Count("catalog", "lostResponse") >= 1);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        // The reserve really happened and its answer was lost; the release (whose answer is lost too, quietly) did run, so nothing is left held.
        Assert.Empty(_catalog.Reservations);
    }
}
