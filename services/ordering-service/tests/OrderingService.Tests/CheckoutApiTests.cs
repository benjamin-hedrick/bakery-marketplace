using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Checkout;
using static OrderingService.Tests.OrderingFactory;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-001 over HTTP: the real ordering host (JWT middleware, endpoints), the real catalog gateway and service-token handler, against a
/// real HTTP stand-in for the catalog and the token endpoint.
/// </summary>
public sealed class CheckoutApiTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;
    private HttpClient _customer = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret);
        _customer = _factory.CustomerClient("customer-1");
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        _customer.Dispose();
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    private static object Body(IEnumerable<object>? lines = null, bool window = true, object? pickupWindow = null) => new
    {
        vendorId = Vendor,
        paymentMethodId = "pm-ok",
        lineItems = (lines ?? [new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 }]).ToArray(),
        pickupWindow = pickupWindow ?? (window ? new { start = WindowStart, end = WindowEnd } : null),
    };

    private static async Task<JsonElement> JsonOf(HttpResponseMessage r) => JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement.Clone();

    // ---- who may call ----------------------------------------------------------------------------

    [Fact]
    public async Task OnlyACustomerMayCheckOut()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await PostCheckout(_factory.CreateClient(), Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PostCheckout(_factory.ClientWithRole("vendor-1", "Vendor"), Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await PostCheckout(_factory.ClientWithRole("admin-1", "Admin"), Body())).StatusCode);
        Assert.Empty(_catalog.To("POST", "/catalog/stock")); // nothing reached the catalog
    }

    [Fact]
    public async Task TheHealthEndpointIsAnonymous() =>
        Assert.Equal(HttpStatusCode.OK, (await _factory.CreateClient().GetAsync("/health")).StatusCode);

    // ---- the happy path and what the catalog saw -------------------------------------------------

    [Fact]
    public async Task CheckoutPlacesThePricedOrderForTheCustomerInTheToken()
    {
        var response = await PostCheckout(_customer, Body());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var order = await JsonOf(response);
        Assert.Equal("Placed", order.GetProperty("status").GetString());
        Assert.Equal("customer-1", order.GetProperty("customerId").GetString());
        Assert.Equal(1800, order.GetProperty("totalCents").GetInt64());
        Assert.Equal("USD", order.GetProperty("currency").GetString());
        Assert.Equal("Pickup", order.GetProperty("fulfillmentType").GetString());
        Assert.Equal(1, order.GetProperty("sequenceNumber").GetInt64());
        var line = order.GetProperty("lineItems")[0];
        Assert.Equal((900, 1800), (line.GetProperty("unitPriceCents").GetInt32(), line.GetProperty("priceCents").GetInt32()));
        Assert.Equal(WindowStart, order.GetProperty("pickupWindow").GetProperty("start").GetDateTimeOffset());
        Assert.Equal(TimeSpan.Zero, order.GetProperty("pickupWindow").GetProperty("start").GetDateTimeOffset().Offset);
        Assert.Equal($"/ordering/orders/{order.GetProperty("id").GetString()}", response.Headers.Location!.ToString());
    }

    [Fact]
    public async Task ListingReadsAreAnonymousAndReserveAndReleaseCarryTheServiceToken()
    {
        await PostCheckout(_customer, Body());

        var read = Assert.Single(_catalog.To("GET", "/catalog/listings/"));
        Assert.Null(read.Authorization); // public data: no credentials sent
        var reserve = Assert.Single(_catalog.To("POST", "/catalog/stock/reservations"));
        Assert.Equal($"Bearer {FakeCatalogServer.ServiceToken}", reserve.Authorization);
        using var sent = JsonDocument.Parse(reserve.Body);
        Assert.Equal(Vendor, sent.RootElement.GetProperty("vendorId").GetString());
        Assert.Equal(2, sent.RootElement.GetProperty("lines")[0].GetProperty("quantity").GetInt32());
    }

    [Fact]
    public async Task TheServiceTokenIsRequestedOnceAndReusedAcrossCheckouts()
    {
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.Created, (await PostCheckout(_customer, Body())).StatusCode);

        var tokenRequest = Assert.Single(_catalog.To("POST", "/token"));
        Assert.Contains("grant_type=client_credentials", tokenRequest.Body);
        Assert.Contains("client_id=ordering-service", tokenRequest.Body);
        Assert.Equal(3, _catalog.To("POST", "/catalog/stock/reservations").Count());
    }

    [Fact]
    public async Task TheCustomerCanReadTheirOrder_AndNobodyElseCan()
    {
        var created = await JsonOf(await PostCheckout(_customer, Body()));
        var id = created.GetProperty("id").GetString();

        var own = await _customer.GetAsync($"/ordering/orders/{id}");
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        Assert.Equal(id, (await JsonOf(own)).GetProperty("id").GetString());

        Assert.Equal(HttpStatusCode.NotFound, (await _factory.CustomerClient("customer-2").GetAsync($"/ordering/orders/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _customer.GetAsync("/ordering/orders/order-nope")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync($"/ordering/orders/{id}")).StatusCode);
    }

    // ---- the customer's order list (WI-CUST-007) --------------------------------------------------

    private async Task<string> PlaceAt(HttpClient client, int minutesAfterStart)
    {
        _factory.Time.Now = Seed.Now.AddMinutes(minutesAfterStart);
        var created = await JsonOf(await PostCheckout(client, Body()));
        return created.GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task TheListHoldsOnlyTheCallersOrders_NewestFirst()
    {
        var first = await PlaceAt(_customer, 0);
        var second = await PlaceAt(_customer, 1);
        var other = await PlaceAt(_factory.CustomerClient("customer-2"), 2);

        var page = await JsonOf(await _customer.GetAsync("/ordering/orders"));

        Assert.Equal([second, first], page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()).ToArray());
        Assert.DoesNotContain(page.GetProperty("items").EnumerateArray(), i => i.GetProperty("id").GetString() == other);
        Assert.All(page.GetProperty("items").EnumerateArray(), i => Assert.Equal("customer-1", i.GetProperty("customerId").GetString()));
        Assert.Equal(JsonValueKind.Null, page.GetProperty("nextCursor").ValueKind);
        Assert.Equal(1800, page.GetProperty("items")[0].GetProperty("totalCents").GetInt64());
    }

    [Fact]
    public async Task ACustomerWithNoOrdersGetsAnEmptyPage()
    {
        await PlaceAt(_customer, 0);

        var page = await JsonOf(await _factory.CustomerClient("customer-9").GetAsync("/ordering/orders"));

        Assert.Empty(page.GetProperty("items").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, page.GetProperty("nextCursor").ValueKind);
    }

    [Fact]
    public async Task PagesFollowTheCursorWithoutRepeatsOrGaps()
    {
        var ids = new List<string>();
        for (var i = 0; i < 5; i++) ids.Add(await PlaceAt(_customer, i));
        ids.Reverse(); // newest first

        var seen = new List<string>();
        string? after = null;
        var pages = 0;
        do
        {
            var url = "/ordering/orders?limit=2" + (after is null ? "" : $"&after={Uri.EscapeDataString(after)}");
            var page = await JsonOf(await _customer.GetAsync(url));
            seen.AddRange(page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!));
            after = page.GetProperty("nextCursor").GetString();
            pages++;
        } while (after is not null && pages < 10);

        Assert.Equal(ids, seen);
        Assert.Equal(3, pages);
    }

    [Fact]
    public async Task OrdersPlacedAtTheSameInstantStillPageInAStableOrder()
    {
        for (var i = 0; i < 3; i++) await PlaceAt(_customer, 0);

        var all = (await JsonOf(await _customer.GetAsync("/ordering/orders"))).GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!).ToList();
        var first = await JsonOf(await _customer.GetAsync("/ordering/orders?limit=1"));
        var second = await JsonOf(await _customer.GetAsync($"/ordering/orders?limit=2&after={Uri.EscapeDataString(first.GetProperty("nextCursor").GetString()!)}"));

        Assert.Equal(3, all.Distinct().Count());
        Assert.Equal(all[0], first.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(all.Skip(1), second.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetString()!));
    }

    [Theory]
    [InlineData("garbage")]
    [InlineData(":order-1")]
    [InlineData("123:")]
    [InlineData("x:order-1")]
    public async Task ACursorThatIsNotOneIsRefused(string after)
    {
        var response = await _customer.GetAsync($"/ordering/orders?after={Uri.EscapeDataString(after)}");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("validation_failed", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task ThePageSizeIsKeptWithinItsBounds()
    {
        for (var i = 0; i < 3; i++) await PlaceAt(_customer, i);

        Assert.Single((await JsonOf(await _customer.GetAsync("/ordering/orders?limit=0"))).GetProperty("items").EnumerateArray());
        Assert.Equal(3, (await JsonOf(await _customer.GetAsync("/ordering/orders?limit=100000"))).GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task OnlyACustomerMayListOrders()
    {
        await PlaceAt(_customer, 0);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/ordering/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientWithRole("vendor-1", "Vendor").GetAsync("/ordering/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientWithRole("admin-1", "Admin").GetAsync("/ordering/orders")).StatusCode);
    }

    [Fact]
    public async Task ACustomerIdInTheQueryCannotShowSomeoneElsesOrders()
    {
        await PlaceAt(_factory.CustomerClient("customer-2"), 0);

        var page = await JsonOf(await _customer.GetAsync("/ordering/orders?customerId=customer-2"));

        Assert.Empty(page.GetProperty("items").EnumerateArray());
    }

    // ---- idempotency over HTTP -----------------------------------------------------------------

    [Fact]
    public async Task ARepeatedSubmitReturnsTheSameOrderAndDoesNotTouchTheCatalogAgain()
    {
        var key = NewKey();
        var first = await PostCheckout(_customer, Body(), key);
        var requests = _catalog.Requests.Count;

        var second = await PostCheckout(_customer, Body(), key);

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal((await JsonOf(first)).GetProperty("id").GetString(), (await JsonOf(second)).GetProperty("id").GetString());
        Assert.Equal(requests, _catalog.Requests.Count);
    }

    [Fact]
    public async Task TheSameKeyWithADifferentRequestIs422()
    {
        var key = NewKey();
        await PostCheckout(_customer, Body(), key);

        var response = await PostCheckout(_customer, Body([new { listingId = "listing-sourdough-001", modifierIds = Array.Empty<string>(), quantity = 1 }]), key);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("idempotency_key_reuse", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task ManySimultaneousSubmitsMakeOneOrderAndOneReservation()
    {
        var key = NewKey();

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => PostCheckout(_customer, Body(), key)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(9, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var ids = await Task.WhenAll(responses.Select(async r => (await JsonOf(r)).GetProperty("id").GetString()));
        Assert.Single(ids.Distinct());
        Assert.Single(_catalog.Reservations);
        Assert.Empty(_catalog.To("DELETE", "/catalog/stock")); // nobody released the winner's stock
    }

    // ---- request errors (422) --------------------------------------------------------------------

    [Fact]
    public async Task AMissingIdempotencyKeyIs422WithAFieldError()
    {
        var response = await PostCheckout(_customer, Body(), noKey: true);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.True((await JsonOf(response)).GetProperty("errors").TryGetProperty("Idempotency-Key", out _));
        Assert.Empty(_catalog.Requests);
    }

    [Fact]
    public async Task AnEmptyBodyIs422_AndBrokenJsonIs400()
    {
        var empty = new HttpRequestMessage(HttpMethod.Post, "/ordering/checkout") { Content = new StringContent("", Encoding.UTF8, "application/json") };
        empty.Headers.Add("Idempotency-Key", NewKey());
        var broken = new HttpRequestMessage(HttpMethod.Post, "/ordering/checkout") { Content = new StringContent("{not json", Encoding.UTF8, "application/json") };
        broken.Headers.Add("Idempotency-Key", NewKey());

        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await _customer.SendAsync(empty)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await _customer.SendAsync(broken)).StatusCode);
    }

    [Fact]
    public async Task AClientCannotSupplyPricesTotalsCustomerOrStatus()
    {
        var response = await PostCheckout(_customer, new
        {
            vendorId = Vendor,
            paymentMethodId = "pm-ok",
            customerId = "someone-else",
            status = "Completed",
            totalCents = 1,
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = Array.Empty<string>(), quantity = 1, priceCents = 1 } },
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var order = await JsonOf(response);
        Assert.Equal("customer-1", order.GetProperty("customerId").GetString());
        Assert.Equal("Confirmed", order.GetProperty("status").GetString()); // the server's rule (no options, no window: WI-ORD-008), not the client's "Completed"
        Assert.Equal(800, order.GetProperty("totalCents").GetInt64());
    }

    [Theory]
    [InlineData(0)]
    [InlineData(21)]
    public async Task AQuantityOutsideTheLimitsIs422(int quantity)
    {
        var response = await PostCheckout(_customer, Body([new { listingId = "listing-latte-001", modifierIds = Array.Empty<string>(), quantity }]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("invalid_quantity", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task AnUnknownOptionIs422()
    {
        var response = await PostCheckout(_customer, Body([new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-nope" }, quantity = 1 }]));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Equal("invalid_modifier", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Empty(_catalog.To("POST", "/catalog/stock"));
    }

    // ---- the world changed (409) -----------------------------------------------------------------

    [Fact]
    public async Task AListingThatDisappearedIs409()
    {
        _catalog.Listings.TryRemove("listing-sourdough-001", out _);

        var response = await PostCheckout(_customer, Body());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("listing_unavailable", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task APickupWindowThatIsGoneIs409()
    {
        var response = await PostCheckout(_customer, Body(pickupWindow: new { start = Now.AddMinutes(-15), end = Now }));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("pickup_window_unavailable", (await JsonOf(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task OutOfStockIs409WithTheQuantityAvailable_AndNothingIsPlaced()
    {
        _catalog.RejectReserveWith = [new { listingId = "listing-sourdough-001", reason = "insufficient_stock", available = 1 }];
        var key = NewKey();

        var response = await PostCheckout(_customer, Body(), key);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("insufficient_stock", body.GetProperty("code").GetString());
        Assert.Equal(1, body.GetProperty("lines")[0].GetProperty("available").GetInt32());
        var id = CheckoutService.OrderIdFor("customer-1", key);
        Assert.Equal(HttpStatusCode.NotFound, (await _customer.GetAsync($"/ordering/orders/{id}")).StatusCode);
    }

    // ---- saved payment methods (WI-ORD-010) -----------------------------------------------------

    private static object BodyWithMethod(string? methodId) => new
    {
        vendorId = Vendor,
        paymentMethodId = methodId,
        lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
        pickupWindow = new { start = WindowStart, end = WindowEnd },
    };

    [Fact]
    public async Task AMethodWithAnInvalidToken_IsDeclinedWith402AndNothingIsReservedOrStored()
    {
        var key = NewKey();

        var response = await PostCheckout(_customer, BodyWithMethod("pm-bad"), key);

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Equal("payment_declined", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Empty(_catalog.To("POST", "/catalog/stock")); // the rule runs before any stock is reserved
        Assert.Empty(_catalog.Reservations);
        Assert.Equal(HttpStatusCode.NotFound, (await _customer.GetAsync($"/ordering/orders/{CheckoutService.OrderIdFor("customer-1", key)}")).StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("pm-unknown")]
    public async Task AMissingOrUnknownMethodIs422OnPaymentMethodId(string? methodId)
    {
        var response = await PostCheckout(_customer, BodyWithMethod(methodId));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var body = await JsonOf(response);
        Assert.Equal("validation_failed", body.GetProperty("code").GetString());
        Assert.True(body.GetProperty("errors").TryGetProperty("paymentMethodId", out _));
    }

    [Fact]
    public async Task AnotherCustomersMethodGetsTheSameAnswerAsAnUnknownOne()
    {
        using var other = _factory.CustomerClient("customer-2"); // customer-2 has its own pm-ok; customer-1 cannot use ids from that partition
        await _factory.Services.GetRequiredService<BakeryMarketplace.Data.IRepository<OrderingService.Persistence.PaymentMethodDocument>>().SaveAsync(
            new OrderingService.Persistence.PaymentMethodDocument { Id = "pm-only-customer-2", CustomerId = "customer-2", Description = "x", Token = "pm_test_valid_token_9" }, "customer-2");

        var foreign = await PostCheckout(_customer, BodyWithMethod("pm-only-customer-2"));
        var unknown = await PostCheckout(_customer, BodyWithMethod("pm-does-not-exist"));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, foreign.StatusCode);
        Assert.Equal(await foreign.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ThePaymentMethodsEndpointListsTheCallersOwnMethodsWithoutTheToken()
    {
        using var other = _factory.CustomerClient("customer-2");

        var response = await _customer.GetAsync("/ordering/payment-methods");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        var list = JsonDocument.Parse(text).RootElement;
        Assert.Equal(["pm-ok", "pm-bad"], list.EnumerateArray().Select(m => m.GetProperty("id").GetString()));
        Assert.All(list.EnumerateArray(), m => Assert.Equal(["description", "id"], m.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal)));
        Assert.DoesNotContain("token", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(PaymentMethods.ValidToken, text);
        Assert.DoesNotContain(PaymentMethods.InvalidToken, text);
    }

    [Fact]
    public async Task ACustomerWithNoMethodsGetsAnEmptyList()
    {
        using var nobody = _factory.ClientWithToken(_factory.Token("customer-with-nothing", "Customer"));

        var response = await nobody.GetAsync("/ordering/payment-methods");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[]", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task OnlyACustomerMayListPaymentMethods()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await _factory.CreateClient().GetAsync("/ordering/payment-methods")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.ClientWithRole("vendor-1", "Vendor").GetAsync("/ordering/payment-methods")).StatusCode);
    }

    [Fact]
    public async Task NeitherTheCheckoutAnswerNorTheOrderShowsTheMethodTheReferenceOrTheToken()
    {
        var created = await PostCheckout(_customer, Body());
        var createdText = await created.Content.ReadAsStringAsync();
        var id = JsonDocument.Parse(createdText).RootElement.GetProperty("id").GetString();
        var fetched = await (await _customer.GetAsync($"/ordering/orders/{id}")).Content.ReadAsStringAsync();
        var listed = await (await _customer.GetAsync("/ordering/orders")).Content.ReadAsStringAsync();

        foreach (var text in new[] { createdText, fetched, listed })
        {
            Assert.DoesNotContain("paymentMethod", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("paymentReference", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("token", text, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("stub-", text);
        }
    }

    // ---- dependencies failing --------------------------------------------------------------------

    [Fact]
    public async Task ACatalogOutageIs503AndNothingIsPlaced()
    {
        _catalog.ListingStatus = 500;

        var response = await PostCheckout(_customer, Body());

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("downstream_unavailable", (await JsonOf(response)).GetProperty("code").GetString());
        Assert.Empty(_catalog.To("POST", "/catalog/stock"));
    }

    [Fact]
    public async Task AFailingReserveIs503_AndARelease_IsAttemptedBecauseTheAnswerMayHaveBeenLost()
    {
        _catalog.ReserveStatus = 500;

        var response = await PostCheckout(_customer, Body());

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Single(_catalog.To("DELETE", "/catalog/stock/reservations/"));
    }

    [Fact]
    public async Task AFailingTokenEndpointIs503_NotACustomerError()
    {
        _catalog.TokenStatus = 500;

        var response = await PostCheckout(_customer, Body());

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Empty(_catalog.Reservations);
    }

    [Fact]
    public async Task AWrongServiceSecretIs503AndTheSecretNeverAppearsInTheResponse()
    {
        await using var misconfigured = new OrderingFactory(_catalog, "not-the-registered-secret-0000");
        using var client = misconfigured.CustomerClient();

        var response = await PostCheckout(client, Body());

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("not-the-registered-secret-0000", text);
        Assert.DoesNotContain(_secret, text);
    }

    [Fact]
    public async Task ErrorBodiesAreStableCodesWithoutStackTracesOrInternals()
    {
        _catalog.ListingStatus = 500;

        var text = await (await PostCheckout(_customer, Body())).Content.ReadAsStringAsync();

        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("   at ", text);
        Assert.DoesNotContain(_catalog.Url, text);
    }

    // ---- startup -------------------------------------------------------------------------------------

    [Fact]
    public void TheServiceWillNotStartWithoutItsServiceCredentials()
    {
        var withoutSecret = new OrderingFactory(_catalog, "");

        Assert.ThrowsAny<Exception>(() => withoutSecret.CreateClient());
    }
}
