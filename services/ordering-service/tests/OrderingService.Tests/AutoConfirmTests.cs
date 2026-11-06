using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BakeryMarketplace.EventSchemas;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Orders;
using static OrderingService.Tests.OrderingFactory;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-008 (human lead, 2026-10-28, option 1): an order with no customization and no pickup-window request confirms by itself at
/// checkout; anything with an option or a requested window waits for the vendor. The rule ignores whether an item has a stock counter.
/// </summary>
public class AutoConfirmTests
{
    private static CheckoutRequest Plain() => Request([Line("listing-sourdough-001", 1)], window: false);

    // ---- the rule ------------------------------------------------------------------------------

    [Fact]
    public void AnOrderWithNoOptionsAndNoWindowQualifies()
    {
        var order = OrderTestSupport.Pending(withWindow: false);
        order.RemoveLine(0, OrderTestSupport.At(2));
        order.AddLine(OrderTestSupport.Line(modifiers: []), OrderTestSupport.At(2));

        Assert.True(AutoConfirmPolicy.Qualifies(order));
    }

    [Fact]
    public void AnOptionOnAnyLineDisqualifies()
    {
        var order = OrderTestSupport.Pending(withWindow: false); // its line has mod-seeds

        Assert.False(AutoConfirmPolicy.Qualifies(order));
    }

    [Fact]
    public void ARequestedPickupWindowDisqualifies()
    {
        var order = OrderTestSupport.Pending(withWindow: true);
        order.RemoveLine(0, OrderTestSupport.At(3));
        order.AddLine(OrderTestSupport.Line(modifiers: []), OrderTestSupport.At(3));

        Assert.False(AutoConfirmPolicy.Qualifies(order));
    }

    // ---- checkout --------------------------------------------------------------------------------

    [Fact]
    public async Task APlainOrderIsConfirmedAtCheckoutAndBothEventsAreStoredAndPublishedInOrder()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Plain());

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.Equal(OrderStatus.Confirmed, result.Order!.Order.Status);
        Assert.Equal(OrderStatus.Confirmed, (await f.Store.GetAsync(result.Order.Order.Id, "customer-1"))!.Order.Status);
        Assert.Equal([OrderEventTypes.Placed, OrderEventTypes.Confirmed], f.Events.Published.Select(p => p.EventType));
        Assert.Equal([1L, 2], f.Events.Published.Select(p => p.Sequence));
        Assert.Empty((await f.Store.GetAsync(result.Order.Order.Id, "customer-1"))!.Document.Outbox);
    }

    [Fact]
    public async Task TheConfirmationIsMarkedAutomaticSoConsumersCanTellItFromAVendorsAcceptance()
    {
        var f = new CheckoutFixture();

        await f.CheckoutAsync(Plain());

        var confirmed = Assert.IsType<OrderConfirmedPayload>(f.Events.Published[1].Payload);
        Assert.True(confirmed.Automatic);
    }

    [Fact]
    public async Task AnOrderWithAnOptionWaitsForTheVendor()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1, "mod-seeds")], window: false));

        Assert.Equal(OrderStatus.Placed, result.Order!.Order.Status);
        Assert.Equal([OrderEventTypes.Placed], f.Events.Published.Select(p => p.EventType));
    }

    [Fact]
    public async Task AnOrderWithARequestedWindowWaitsForTheVendor()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1)], window: true));

        Assert.Equal(OrderStatus.Placed, result.Order!.Order.Status);
        Assert.Equal([OrderEventTypes.Placed], f.Events.Published.Select(p => p.EventType));
    }

    [Fact]
    public async Task OneOptionedLineAmongPlainOnesIsEnoughToWait()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request(
            [Line("listing-sourdough-001", 1), Line("listing-croissant-001", 1, "mod-extra-almond")], window: false));

        Assert.Equal(OrderStatus.Placed, result.Order!.Order.Status);
    }

    [Fact]
    public async Task TheRuleCanBeSwitchedOff()
    {
        var f = new CheckoutFixture();
        f.CheckoutSettings.AutoConfirm = false;

        var result = await f.CheckoutAsync(Plain());

        Assert.Equal(OrderStatus.Placed, result.Order!.Order.Status);
        Assert.Equal([OrderEventTypes.Placed], f.Events.Published.Select(p => p.EventType));
    }

    [Fact]
    public async Task ARepeatedPlainCheckoutReturnsTheSameConfirmedOrderWithoutNewEvents()
    {
        var f = new CheckoutFixture();
        var key = NewKey();

        await f.CheckoutAsync(Plain(), key);
        var repeat = await f.CheckoutAsync(Plain(), key);

        Assert.Equal(CheckoutOutcome.Existing, repeat.Outcome);
        Assert.Equal(OrderStatus.Confirmed, repeat.Order!.Order.Status);
        Assert.Equal(2, f.Events.Published.Count);
    }

    [Fact]
    public async Task ADeclinedPaymentOnAPlainOrderStoresAndPublishesNothing()
    {
        var f = new CheckoutFixture();

        f.Payments.Decline = true; // the processor refuses after the reservation was taken

        var result = await f.CheckoutAsync(Plain());

        Assert.Equal(CheckoutOutcome.PaymentDeclined, result.Outcome);
        Assert.Empty(f.Events.Published);
        Assert.Single(f.Catalog.ReleaseCalls); // the reservation taken for it was given back
    }

    [Fact]
    public async Task ABrokerOutageStillLeavesBothEventsForTheRelayInOrder()
    {
        var f = new CheckoutFixture();
        f.Events.Fail = true;

        var result = await f.CheckoutAsync(Plain());
        f.Events.Fail = false;
        f.Time.Now = f.Time.Now.AddSeconds(f.Outbox.GraceSeconds + 1);
        await f.Relay.SweepOnceAsync(default);

        Assert.Equal(OrderStatus.Confirmed, result.Order!.Order.Status);
        Assert.Equal([OrderEventTypes.Placed, OrderEventTypes.Confirmed], f.Events.Published.Select(p => p.EventType));
    }

    // ---- afterwards -------------------------------------------------------------------------------

    [Fact]
    public async Task ACustomerCanStillCancelAnAutoConfirmedOrderAndTheStockIsReleased()
    {
        var f = new CheckoutFixture();
        var id = (await f.CheckoutAsync(Plain())).Order!.Order.Id;

        var cancel = await f.Actions.ActAsync(id, new OrderCaller("customer-1", IsVendor: false, IsCustomer: true), OrderAction.Cancel);

        Assert.Equal(OrderActionOutcome.Done, cancel.Outcome);
        Assert.Equal(id, Assert.Single(f.Catalog.ReleaseCalls));
        Assert.Equal(OrderEventTypes.Cancelled, f.Events.Published[^1].EventType);
    }

    [Fact]
    public async Task TheVendorCannotConfirmAgainButCanMoveItOn()
    {
        var f = new CheckoutFixture();
        var id = (await f.CheckoutAsync(Plain())).Order!.Order.Id;
        var vendor = new OrderCaller(Vendor, IsVendor: true, IsCustomer: false);

        var again = await f.Actions.ActAsync(id, vendor, OrderAction.Confirm);
        var start = await f.Actions.ActAsync(id, vendor, OrderAction.StartPreparation);

        Assert.Equal(OrderActionOutcome.Conflict, again.Outcome);
        Assert.Equal(OrderStatus.Confirmed, again.CurrentStatus);
        Assert.Equal(OrderActionOutcome.Done, start.Outcome);
    }

    [Fact]
    public async Task AVendorsOwnConfirmationIsNotMarkedAutomatic()
    {
        var f = new CheckoutFixture();
        var id = (await f.CheckoutAsync(Request([Line("listing-sourdough-001", 1, "mod-seeds")], window: false))).Order!.Order.Id;

        await f.Actions.ActAsync(id, new OrderCaller(Vendor, IsVendor: true, IsCustomer: false), OrderAction.Confirm);

        Assert.False(Assert.IsType<OrderConfirmedPayload>(f.Events.Published[^1].Payload).Automatic);
    }

    // ---- over HTTP ---------------------------------------------------------------------------------

    [Fact]
    public async Task OverHttpAPlainOrderComesBackConfirmedAndAnOptionedOneComesBackPlaced()
    {
        var secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
        await using var catalog = new FakeCatalogServer(secret);
        await using var factory = new OrderingFactory(catalog, secret);
        using var customer = factory.CustomerClient("customer-1");

        var plain = await PostCheckout(customer, new
        {
            vendorId = Vendor,
            paymentMethodId = "pm-ok",
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = Array.Empty<string>(), quantity = 1 } },
        });
        var optioned = await PostCheckout(customer, new
        {
            vendorId = Vendor,
            paymentMethodId = "pm-ok",
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 1 } },
        });

        Assert.Equal(HttpStatusCode.Created, plain.StatusCode);
        Assert.Equal("Confirmed", JsonDocument.Parse(await plain.Content.ReadAsStringAsync()).RootElement.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Created, optioned.StatusCode);
        Assert.Equal("Placed", JsonDocument.Parse(await optioned.Content.ReadAsStringAsync()).RootElement.GetProperty("status").GetString());
    }
}
