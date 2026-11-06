using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using static OrderingService.Tests.OrderingFactory;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-009 over HTTP: the whole path from the customer's checkout to the vendor's read, and the privacy properties (who may read an order's allergens,
/// and that no log line or span carries one). The stream sends the same <c>VendorOrderDto</c> as the single read, so what the single read shows is what it shows.
/// </summary>
public sealed class OrderAllergenApiTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private readonly Capture _logs = new();
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;
    private HttpClient _customer = null!;
    private HttpClient _vendor = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret, logs: _logs);
        _customer = _factory.CustomerClient("customer-1");
        _vendor = _factory.ClientWithRole(Vendor, "Vendor");
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _customer.Dispose();
        _vendor.Dispose();
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    private static object Body(params string[] allergens) => new
    {
        vendorId = Vendor,
        paymentMethodId = "pm-ok",
        lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
        pickupWindow = new { start = WindowStart, end = WindowEnd },
        allergens,
    };

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    private static string[] Strings(JsonElement array) => array.EnumerateArray().Select(a => a.GetString()!).ToArray();

    private async Task<string> PlaceAsync(params string[] allergens)
    {
        var response = await PostCheckout(_customer, Body(allergens));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await JsonOf(response)).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task TheCustomerSeesTheirOrdersAllergensAndNobodyElseDoes()
    {
        var order = await JsonOf(await PostCheckout(_customer, Body("tree-nut", "dairy")));
        var id = order.GetProperty("id").GetString()!;
        Assert.Equal(["dairy", "tree-nut"], Strings(order.GetProperty("allergens")));

        var read = await _customer.GetAsync($"/ordering/orders/{id}");
        Assert.Equal(["dairy", "tree-nut"], Strings((await JsonOf(read)).GetProperty("allergens")));
        var list = await JsonOf(await _customer.GetAsync("/ordering/orders"));
        Assert.Equal(["dairy", "tree-nut"], Strings(list.GetProperty("items")[0].GetProperty("allergens")));

        using var other = _factory.CustomerClient("customer-2");
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/ordering/orders/{id}")).StatusCode);
        Assert.DoesNotContain("tree-nut", await (await other.GetAsync("/ordering/orders")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AnOrderWithNoAllergensHasAnEmptyList()
    {
        var order = await JsonOf(await PostCheckout(_customer, Body()));

        Assert.Empty(order.GetProperty("allergens").EnumerateArray());
    }

    [Fact]
    public async Task AnUnknownAllergenIs422NamingTheFieldAndNoOrderExists()
    {
        var response = await PostCheckout(_customer, Body("dairy", "vegan"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var error = await JsonOf(response);
        Assert.Equal("validation_failed", error.GetProperty("code").GetString());
        Assert.True(error.GetProperty("errors").TryGetProperty("allergens[1]", out _));
        Assert.Empty((await JsonOf(await _customer.GetAsync("/ordering/orders"))).GetProperty("items").EnumerateArray());
        Assert.Empty(_catalog.Reservations);
    }

    [Fact]
    public async Task WhenTheCatalogCannotAnswerTheRegistryTheCheckoutIs503()
    {
        _catalog.TagsStatus = 500;

        var response = await PostCheckout(_customer, Body("dairy"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Empty(_catalog.Reservations);
    }

    [Fact]
    public async Task TheRegistryIsReadFromTheCatalogsPublicEndpointWithoutACredential()
    {
        await PlaceAsync("sesame");

        var read = Assert.Single(_catalog.To("GET", "/catalog/tags"));
        Assert.Contains("kind=allergen", read.Path);
        Assert.Null(read.Authorization);
    }

    [Fact]
    public async Task TheVendorWhoHasTheOrderSeesItsAllergensInTheListAndTheSingleRead()
    {
        var id = await PlaceAsync("peanut", "egg");

        var list = await JsonOf(await _vendor.GetAsync("/ordering/vendor/orders"));
        Assert.Equal(["egg", "peanut"], Strings(list.GetProperty("items")[0].GetProperty("allergens")));
        var single = await JsonOf(await _vendor.GetAsync($"/ordering/vendor/orders/{id}"));
        Assert.Equal(["egg", "peanut"], Strings(single.GetProperty("allergens")));
    }

    [Fact]
    public async Task AnotherVendorNeverSeesAnOrdersAllergensInTheListOrTheSingleRead()
    {
        var id = await PlaceAsync("peanut");
        using var other = _factory.ClientWithRole("vendor-other", "Vendor");

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
        var list = await other.GetAsync("/ordering/vendor/orders");
        Assert.Empty((await JsonOf(list)).GetProperty("items").EnumerateArray());
        Assert.DoesNotContain("peanut", await list.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ACustomerTokenCannotReadTheVendorViewAndAVendorTokenCannotCheckOut()
    {
        var id = await PlaceAsync("peanut");

        Assert.Equal(HttpStatusCode.Forbidden, (await _customer.GetAsync($"/ordering/vendor/orders/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PostCheckout(_vendor, Body("peanut"))).StatusCode);
    }

    [Fact]
    public async Task NoLogLineOrSpanCarriesTheAllergensOfACheckout()
    {
        var spans = new ConcurrentQueue<string>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = a => spans.Enqueue(
                a.DisplayName + " " + string.Join(" ", a.TagObjects.Select(t => $"{t.Key}={t.Value}")) + " "
                + string.Join(" ", a.Events.SelectMany(e => e.Tags).Select(t => $"{t.Key}={t.Value}"))),
        };
        ActivitySource.AddActivityListener(listener);

        var id = await PlaceAsync("tree-nut", "sesame");
        await _vendor.GetAsync($"/ordering/vendor/orders/{id}");
        await _customer.GetAsync($"/ordering/orders/{id}");

        Assert.NotEmpty(_logs.Lines); // the capture works: the checkout logged something
        Assert.NotEmpty(spans);
        foreach (var line in _logs.Lines.Concat(spans))
        {
            Assert.DoesNotContain("tree-nut", line, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("sesame", line, StringComparison.OrdinalIgnoreCase);
        }
    }

    private sealed class Capture : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _lines = new();
        public string[] Lines => _lines.ToArray();
        public ILogger CreateLogger(string categoryName) => new Sink(_lines);
        public void Dispose() { }

        private sealed class Sink(ConcurrentQueue<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                lines.Enqueue(formatter(state, exception) + " " + (state is IEnumerable<KeyValuePair<string, object?>> kv ? string.Join(" ", kv.Select(p => $"{p.Key}={p.Value}")) : ""));
        }
    }
}
