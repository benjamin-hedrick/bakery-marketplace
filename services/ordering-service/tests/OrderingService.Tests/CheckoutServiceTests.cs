using BakeryMarketplace.EventSchemas;
using OrderingService.Checkout;
using OrderingService.Domain;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>WI-ORD-001: the checkout flow and its error behavior (first-slice contract section 6), against scripted collaborators.</summary>
public class CheckoutServiceTests
{
    // ---- pricing: the contract's expected totals (section 7) -------------------------------------

    [Theory]
    [InlineData("listing-sourdough-001", 2, new[] { "mod-seeds" }, 1800)] // 2 x (800 + 100)
    [InlineData("listing-croissant-001", 1, new[] { "mod-extra-almond" }, 525)] // 450 + 75
    [InlineData("listing-latte-001", 3, new[] { "mod-extra-shot", "mod-vanilla" }, 1875)] // 3 x (500 + 75 + 50)
    public async Task PricesAreComputedFromTheCatalogInIntegerCents(string listing, int quantity, string[] modifiers, long expectedTotal)
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request([Line(listing, quantity, modifiers)]));

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.Equal(expectedTotal, result.Order!.Order.TotalCents);
        Assert.Equal(expectedTotal, result.Order.Document.TotalCents);
        Assert.Equal(expectedTotal, Assert.Single(f.Payments.Requests).AmountCents); // what is authorized is what was priced
    }

    [Fact]
    public async Task TheClientNeverSuppliesAPriceAndEverythingIsRepricedFromTheCatalogNow()
    {
        var f = new CheckoutFixture();
        f.Catalog.Listings["listing-sourdough-001"] = Sourdough() with { PriceCents = 900 }; // the price moved since the page loaded

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1)]));

        Assert.Equal(900, result.Order!.Order.TotalCents);
    }

    // ---- the happy path ----------------------------------------------------------------------------

    [Fact]
    public async Task APlacedOrderIsStoredWithTheCustomerFromTheTokenAndTheChosenWindow()
    {
        var f = new CheckoutFixture();
        var key = NewKey();

        var result = await f.Service.CheckoutAsync("customer-7", key, Request([Line("listing-sourdough-001", 2, "mod-seeds")]), false);

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        var order = result.Order!.Order;
        Assert.Equal(CheckoutService.OrderIdFor("customer-7", key), order.Id);
        Assert.Equal(("customer-7", Vendor, OrderStatus.Placed), (order.CustomerId, order.VendorId, order.Status));
        Assert.Equal(1, order.SequenceNumber);
        Assert.Equal(WindowStart, order.Fulfillment!.Pickup!.WindowStart);
        Assert.Equal(WindowEnd, order.Fulfillment.Pickup.WindowEnd);

        var stored = await f.Store.GetAsync(order.Id, "customer-7");
        Assert.Equal(OrderStatus.Placed, stored!.Order.Status);
        Assert.Null(await f.Store.GetAsync(order.Id, "customer-8")); // visible only to its customer
    }

    [Fact]
    public async Task TheWindowIsOptional()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request(window: false));

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.Null(result.Order!.Order.Fulfillment);
    }

    [Fact]
    public async Task StockIsReservedOnceForTheWholeOrder_WithSeveralLinesForOneListingKeptAsLines()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1, "mod-seeds"), Line("listing-sourdough-001", 2), Line("listing-latte-001", 1)]));

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        var reserve = Assert.Single(f.Catalog.ReserveCalls);
        Assert.Equal((result.Order!.Order.Id, Vendor), (reserve.OrderId, reserve.VendorId));
        Assert.Equal(3, reserve.Lines.Count); // the catalog sums per listing
        Assert.Contains(result.Order.Order.Id, f.Catalog.ReservedOrders);
        Assert.Empty(f.Catalog.ReleaseCalls);
    }

    // ---- idempotency (D-6) ---------------------------------------------------------------------------

    [Fact]
    public async Task RepeatingACheckoutReturnsTheOriginalOrderAndTouchesNothing()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        var first = await f.CheckoutAsync(key: key);
        var reads = f.Catalog.ListingReads;

        var second = await f.CheckoutAsync(key: key);

        Assert.Equal(CheckoutOutcome.Existing, second.Outcome);
        Assert.Equal(first.Order!.Order.Id, second.Order!.Order.Id);
        Assert.Equal(reads, f.Catalog.ListingReads); // no catalog read
        Assert.Single(f.Catalog.ReserveCalls); // no second reservation
        Assert.Single(f.Payments.Requests); // no second authorization
    }

    [Fact]
    public async Task TheSameKeyWithADifferentRequestIsRefused()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1)]), key);

        var different = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 2)]), key);

        Assert.Equal(CheckoutOutcome.KeyReuse, different.Outcome);
        Assert.Equal("idempotency_key_reuse", different.Code);
        Assert.Single(f.Catalog.ReserveCalls);
    }

    [Fact]
    public async Task TheOrderOfOptionsOnALineDoesNotMakeItADifferentRequest()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        await f.CheckoutAsync(Request([Line("listing-latte-001", 1, "mod-extra-shot", "mod-vanilla")]), key);

        var again = await f.CheckoutAsync(Request([Line("listing-latte-001", 1, "mod-vanilla", "mod-extra-shot")]), key);

        Assert.Equal(CheckoutOutcome.Existing, again.Outcome);
    }

    [Fact]
    public async Task TwoCustomersMayUseTheSameKey_AndGetDifferentOrders()
    {
        var f = new CheckoutFixture();
        var key = NewKey();

        var a = await f.CheckoutAsync(key: key, customer: "customer-1");
        var b = await f.CheckoutAsync(key: key, customer: "customer-2");

        Assert.Equal(CheckoutOutcome.Created, a.Outcome);
        Assert.Equal(CheckoutOutcome.Created, b.Outcome);
        Assert.NotEqual(a.Order!.Order.Id, b.Order!.Order.Id);
    }

    [Fact]
    public async Task ManySimultaneousSubmitsOfOneCheckoutCreateOneOrderAndHoldTheStockOnce()
    {
        var f = new CheckoutFixture();
        var key = NewKey();

        var results = await Task.WhenAll(Enumerable.Range(0, 12).Select(_ => f.CheckoutAsync(key: key)));

        Assert.Equal(1, results.Count(r => r.Outcome == CheckoutOutcome.Created));
        Assert.Equal(11, results.Count(r => r.Outcome == CheckoutOutcome.Existing));
        Assert.Single(results.Select(r => r.Order!.Order.Id).Distinct());
        Assert.Single(f.Catalog.ReservedOrders); // one reservation, however many requests raced
        Assert.Empty(f.Catalog.ReleaseCalls); // the winner's reservation must never be released by a loser
    }

    // ---- request errors (422) ------------------------------------------------------------------------

    public static IEnumerable<object?[]> BadRequests() =>
    [
        ["no key", null, Request(), "validation_failed"],
        ["short key", "abc", Request(), "validation_failed"],
        ["key with spaces", "has some spaces in it", Request(), "validation_failed"],
        ["no vendor", NewKey(), Request(vendor: " "), "validation_failed"],
        ["no lines", NewKey(), new CheckoutRequest(Vendor, [], null), "validation_failed"],
        ["zero quantity", NewKey(), Request([Line("listing-sourdough-001", 0)]), "invalid_quantity"],
        ["above the line limit", NewKey(), Request([Line("listing-sourdough-001", OrderRules.MaxQuantityPerLine + 1)]), "invalid_quantity"],
        ["too many lines", NewKey(), Request(Enumerable.Range(0, OrderRules.MaxLines + 1).Select(i => Line($"listing-{i}", 1))), "invalid_quantity"],
        ["no listing id", NewKey(), Request([Line("", 1)]), "validation_failed"],
        ["duplicate option", NewKey(), Request([Line("listing-sourdough-001", 1, "mod-seeds", "mod-seeds")]), "invalid_modifier"],
        ["window with only a start", NewKey(), new CheckoutRequest(Vendor, [Line("listing-sourdough-001", 1)], new PickupWindowRequest(WindowStart, null)), "validation_failed"],
        ["window ending before it starts", NewKey(), new CheckoutRequest(Vendor, [Line("listing-sourdough-001", 1)], new PickupWindowRequest(WindowEnd, WindowStart)), "validation_failed"],
    ];

    [Theory]
    [MemberData(nameof(BadRequests))]
    public async Task ABadRequestIsRefusedBeforeAnythingHappens(string why, string? key, CheckoutRequest request, string code)
    {
        var f = new CheckoutFixture();

        var result = await f.Service.CheckoutAsync("customer-1", key, request, false);

        Assert.True(result.Outcome == CheckoutOutcome.Invalid, why);
        Assert.Equal(code, result.Code);
        Assert.Equal(0, f.Catalog.ListingReads);
        Assert.Empty(f.Catalog.ReserveCalls);
        Assert.Empty(f.Payments.Requests);
    }

    [Fact]
    public async Task AnOptionThatIsNotOnTheListingIsInvalid()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1, "mod-extra-almond")]));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Equal("invalid_modifier", result.Code);
        Assert.Empty(f.Catalog.ReserveCalls);
    }

    [Fact]
    public async Task MoreThanTheListingsMaxPerOrderIsInvalid_EvenSplitAcrossLines()
    {
        var f = new CheckoutFixture(); // sourdough: at most 4 per order

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 3), Line("listing-sourdough-001", 2, "mod-seeds")]));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Equal("invalid_quantity", result.Code);
        Assert.Empty(f.Catalog.ReserveCalls);
    }

    // ---- the world changed (409) ---------------------------------------------------------------------

    [Fact]
    public async Task AListingThatIsGoneOrNotPublishedOrAnotherVendorsIsUnavailable()
    {
        foreach (var scenario in new Action<FakeCatalog>[]
                 {
                     c => c.Listings.Remove("listing-sourdough-001"),
                     c => c.Listings["listing-sourdough-001"] = Sourdough(status: "Draft"),
                     c => c.Listings["listing-sourdough-001"] = Sourdough(vendor: "someone-else"),
                 })
        {
            var f = new CheckoutFixture();
            scenario(f.Catalog);

            var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1)]));

            Assert.Equal(CheckoutOutcome.Conflict, result.Outcome);
            Assert.Equal("listing_unavailable", result.Code);
            Assert.Empty(f.Catalog.ReserveCalls);
        }
    }

    [Theory]
    [InlineData(-30)] // in the past
    [InlineData(10)] // inside the 30-minute lead time
    public async Task AWindowThatIsPastOrTooSoonIsUnavailable(int minutesFromNow)
    {
        var f = new CheckoutFixture();
        var start = Now.AddMinutes(minutesFromNow);

        var result = await f.CheckoutAsync(new CheckoutRequest(Vendor, [Line("listing-sourdough-001", 1)], new PickupWindowRequest(start, start.AddMinutes(15))));

        Assert.Equal(CheckoutOutcome.Conflict, result.Outcome);
        Assert.Equal("pickup_window_unavailable", result.Code);
        Assert.Empty(f.Catalog.ReserveCalls);
    }

    [Fact]
    public async Task AWindowOffTheGridOrOutsideOpeningHoursIsUnavailable()
    {
        foreach (var start in new[] { WindowStart.AddMinutes(5), new DateTimeOffset(2026, 1, 15, 23, 0, 0, TimeSpan.Zero) /* 18:00 EST */ })
        {
            var f = new CheckoutFixture();

            var result = await f.CheckoutAsync(new CheckoutRequest(Vendor, [Line("listing-sourdough-001", 1)], new PickupWindowRequest(start, start.AddMinutes(15))));

            Assert.Equal("pickup_window_unavailable", result.Code);
        }
    }

    [Fact]
    public async Task AWindowThatWasOfferedEarlierIsRefusedOnceTheClockHasMovedPastIt()
    {
        var f = new CheckoutFixture();
        f.Time.Now = WindowStart.AddMinutes(-10); // the 09:00 slot is now only 10 minutes away

        var result = await f.CheckoutAsync();

        Assert.Equal("pickup_window_unavailable", result.Code); // D-8: checked again at checkout
    }

    [Fact]
    public async Task NotEnoughStockRejectsTheOrder_NothingIsStoredPaidOrReleased()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        f.Catalog.ReserveOutcome = new StockReservationOutcome(false, "reservation_rejected", [new StockLineRejection("listing-sourdough-001", "insufficient_stock", 1)]);

        var result = await f.CheckoutAsync(key: key);

        Assert.Equal(CheckoutOutcome.Conflict, result.Outcome);
        Assert.Equal("insufficient_stock", result.Code);
        Assert.Equal(1, Assert.Single(result.StockRejections!).Available);
        Assert.Empty(f.Payments.Requests);
        Assert.Empty(f.Catalog.ReleaseCalls); // nothing was reserved, so nothing to release
        Assert.Null(await f.Store.GetAsync(CheckoutService.OrderIdFor("customer-1", key), "customer-1"));
    }

    [Theory]
    [InlineData("not_available", "listing_unavailable", CheckoutOutcome.Conflict)]
    [InlineData("listing_not_found", "listing_unavailable", CheckoutOutcome.Conflict)]
    [InlineData("exceeds_max_per_order", "invalid_quantity", CheckoutOutcome.Invalid)]
    public async Task TheCatalogsReasonsAreMappedToCheckoutErrors(string reason, string code, CheckoutOutcome outcome)
    {
        var f = new CheckoutFixture();
        f.Catalog.ReserveOutcome = new StockReservationOutcome(false, "reservation_rejected", [new StockLineRejection("listing-sourdough-001", reason, null)]);

        var result = await f.CheckoutAsync();

        Assert.Equal((outcome, code), (result.Outcome, result.Code));
    }

    // ---- payment (stub) --------------------------------------------------------------------------------

    [Fact]
    public async Task ADeclinedPaymentReleasesTheStockAndStoresNothing()
    {
        var f = new CheckoutFixture();
        var key = NewKey();

        var result = await f.CheckoutAsync(key: key, decline: true);

        Assert.Equal(CheckoutOutcome.PaymentDeclined, result.Outcome);
        Assert.Equal("payment_declined", result.Code);
        Assert.Equal([CheckoutService.OrderIdFor("customer-1", key)], f.Catalog.ReleaseCalls);
        Assert.Empty(f.Catalog.ReservedOrders);
        Assert.Null(await f.Store.GetAsync(CheckoutService.OrderIdFor("customer-1", key), "customer-1"));
    }

    [Fact]
    public async Task ADeclinedCheckoutCanBeRetriedWithTheSameKey()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        await f.CheckoutAsync(key: key, decline: true);

        var retry = await f.CheckoutAsync(key: key);

        Assert.Equal(CheckoutOutcome.Created, retry.Outcome); // nothing was stored, so the key is still free
    }

    // ---- failures along the way ----------------------------------------------------------------------

    [Fact]
    public async Task AFailureToStoreReleasesTheStockAndSurfaces()
    {
        var f = new CheckoutFixture();
        f.Repository.FailWrites = true;

        await Assert.ThrowsAsync<InvalidOperationException>(() => f.CheckoutAsync());

        Assert.Single(f.Catalog.ReleaseCalls);
        Assert.Empty(f.Catalog.ReservedOrders);
    }

    [Fact]
    public async Task ACatalogOutageWhileReadingListingsIsUnavailable_AndNothingElseHappens()
    {
        var f = new CheckoutFixture();
        f.Catalog.ListingReadsFail = true;

        var result = await f.CheckoutAsync();

        Assert.Equal(CheckoutOutcome.Unavailable, result.Outcome);
        Assert.Empty(f.Catalog.ReserveCalls);
        Assert.Empty(f.Payments.Requests);
    }

    [Fact]
    public async Task ALostAnswerToTheReserveCallStillAttemptsARelease()
    {
        var f = new CheckoutFixture();
        f.Catalog.ReserveFails = true; // the catalog may or may not have reserved

        var result = await f.CheckoutAsync();

        Assert.Equal(CheckoutOutcome.Unavailable, result.Outcome);
        Assert.Single(f.Catalog.ReleaseCalls);
        Assert.Empty(f.Payments.Requests);
    }

    [Fact]
    public async Task AReleaseThatFailsDoesNotMaskTheOriginalOutcome()
    {
        var f = new CheckoutFixture();
        f.Catalog.ReleaseFails = true;

        var result = await f.CheckoutAsync(decline: true);

        Assert.Equal(CheckoutOutcome.PaymentDeclined, result.Outcome); // the customer still gets the real answer; the failed release is logged
        Assert.Single(f.Catalog.ReleaseCalls);
    }

    // ---- ids ---------------------------------------------------------------------------------------------

    [Fact]
    public void TheOrderIdIsStableHashedAndNeverContainsTheKey()
    {
        var key = "my-secret-looking-key-123";

        var id = CheckoutService.OrderIdFor("customer-1", key);

        Assert.Equal(id, CheckoutService.OrderIdFor("customer-1", key));
        Assert.NotEqual(id, CheckoutService.OrderIdFor("customer-2", key));
        Assert.DoesNotContain(key, id);
        Assert.Matches("^order-[0-9a-f]{32}$", id);
    }
}
