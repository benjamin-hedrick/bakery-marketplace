using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Persistence;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-007 over HTTP: roles and ownership through the real JWT middleware and policies, status codes, and the stored result. A vendor is
/// identified by a token whose subject is the vendor id (the mock issuer's vendor ids and the seed's do not line up, open item 33).
/// </summary>
public sealed class OrderActionApiTests : IAsyncLifetime
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

    private async Task<string> PlaceOrderAsync()
    {
        var response = await PostCheckout(_customer, new
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

    private static Task<HttpResponseMessage> Post(HttpClient client, string id, string action) => client.PostAsync($"/ordering/orders/{id}/{action}", null);

    private async Task<string> StatusAsync(string id) => (await JsonOf(await _customer.GetAsync($"/ordering/orders/{id}"))).GetProperty("status").GetString()!;

    public static IEnumerable<object[]> VendorActions() =>
        new[] { "confirm", "decline", "start-preparation", "ready", "complete" }.Select(a => new object[] { a });

    // ---- who may call --------------------------------------------------------------------------------

    [Theory]
    [MemberData(nameof(VendorActions))]
    public async Task AVendorActionNeedsAVendorToken(string action)
    {
        var id = await PlaceOrderAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_factory.CreateClient(), id, action)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(_customer, id, action)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(_factory.ClientWithRole("admin-1", "Admin"), id, action)).StatusCode);
        Assert.Equal("Placed", await StatusAsync(id));
    }

    [Theory]
    [MemberData(nameof(VendorActions))]
    public async Task AnotherVendorGetsNotFoundExactlyAsIfTheOrderDidNotExist(string action)
    {
        var id = await PlaceOrderAsync();
        using var other = _factory.ClientWithRole("vendor-other", "Vendor");

        var theirs = await Post(other, id, action);
        var missing = await Post(other, "order-missing", action);

        Assert.Equal(HttpStatusCode.NotFound, theirs.StatusCode);
        Assert.Equal(await theirs.Content.ReadAsStringAsync(), await missing.Content.ReadAsStringAsync()); // indistinguishable
        Assert.Equal("Placed", await StatusAsync(id));
    }

    [Fact]
    public async Task CancelNeedsACustomerOrVendorTokenAndNotAnAdminOrAnonymous()
    {
        var id = await PlaceOrderAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post(_factory.CreateClient(), id, "cancel")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(_factory.ClientWithRole("admin-1", "Admin"), id, "cancel")).StatusCode);
        Assert.Equal("Placed", await StatusAsync(id));
    }

    [Fact]
    public async Task AnotherCustomerAndAnotherVendorCannotCancelThisOrder()
    {
        var id = await PlaceOrderAsync();
        using var otherCustomer = _factory.CustomerClient("customer-2");
        using var otherVendor = _factory.ClientWithRole("vendor-other", "Vendor");

        Assert.Equal(HttpStatusCode.NotFound, (await Post(otherCustomer, id, "cancel")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(otherVendor, id, "cancel")).StatusCode);
        Assert.Equal("Placed", await StatusAsync(id));
        Assert.Empty(_catalog.To("DELETE", "/catalog/stock/reservations"));
    }

    [Fact]
    public async Task TheActorOfACancellationComesFromTheTokenNotFromTheRequest()
    {
        var id = await PlaceOrderAsync();
        var request = new HttpRequestMessage(HttpMethod.Post, $"/ordering/orders/{id}/cancel")
        {
            Content = JsonContent.Create(new { actor = "Vendor", reason = "VendorCancelled", cancelledBy = "Vendor" }),
        };

        var response = await _customer.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = (await _factory.Services.GetRequiredService<OrderStore>().GetAsync(id, "customer-1"))!.Order;
        Assert.Equal(OrderCancelActor.Customer, stored.CancelledBy);
        Assert.Equal(OrderCancelReason.CustomerRequested, stored.CancelReason);
    }

    // ---- the lifecycle -------------------------------------------------------------------------------

    [Fact]
    public async Task AVendorWalksAnOrderToCompletedAndEachResponseShowsTheNewStatus()
    {
        var id = await PlaceOrderAsync();

        foreach (var (action, status) in new[] { ("confirm", "Confirmed"), ("start-preparation", "InPreparation"), ("ready", "ReadyForFulfillment") })
        {
            var response = await Post(_vendor, id, action);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(status, (await JsonOf(response)).GetProperty("status").GetString());
        }

        // Handed over is accepted, not done: the pickup strategy completes the order moments later (WI-ORD-003).
        var handedOver = await Post(_vendor, id, "complete");
        Assert.Equal(HttpStatusCode.Accepted, handedOver.StatusCode);
        Assert.Equal("ReadyForFulfillment", (await JsonOf(handedOver)).GetProperty("status").GetString());
        for (var i = 0; i < 100 && await StatusAsync(id) != "Completed"; i++) await Task.Delay(50);
        Assert.Equal("Completed", await StatusAsync(id)); // the customer sees it too
        Assert.Empty(_catalog.To("DELETE", "/catalog/stock/reservations")); // no stock released on the way
    }

    [Fact]
    public async Task ADisallowedTransitionIs409WithTheCurrentStatusAndChangesNothing()
    {
        var id = await PlaceOrderAsync();

        var response = await Post(_vendor, id, "ready");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("invalid_transition", body.GetProperty("code").GetString());
        Assert.Equal("Placed", body.GetProperty("currentStatus").GetString());
        Assert.Equal("Placed", await StatusAsync(id));
    }

    [Fact]
    public async Task RepeatingAnActionIs409()
    {
        var id = await PlaceOrderAsync();
        Assert.Equal(HttpStatusCode.OK, (await Post(_vendor, id, "confirm")).StatusCode);

        var repeat = await Post(_vendor, id, "confirm");

        Assert.Equal(HttpStatusCode.Conflict, repeat.StatusCode);
        Assert.Equal("Confirmed", (await JsonOf(repeat)).GetProperty("currentStatus").GetString());
    }

    [Fact]
    public async Task DecliningReleasesTheReservationAtTheCatalogAndTheCustomerSeesCancelled()
    {
        var id = await PlaceOrderAsync();
        Assert.True(_catalog.Reservations.ContainsKey(id));

        var response = await Post(_vendor, id, "decline");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(_catalog.Reservations.ContainsKey(id)); // the real release call, with the service token, reached the catalog
        Assert.Equal("Cancelled", await StatusAsync(id));
    }

    [Fact]
    public async Task ACustomerCancelReleasesTheReservationAndCancelAgainIs409WithoutAnotherRelease()
    {
        var id = await PlaceOrderAsync();

        var first = await Post(_customer, id, "cancel");
        var second = await Post(_customer, id, "cancel");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        Assert.False(_catalog.Reservations.ContainsKey(id));
        Assert.Single(_catalog.To("DELETE", "/catalog/stock/reservations"));
    }
}
