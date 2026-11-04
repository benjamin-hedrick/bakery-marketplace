using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.Logging.Abstractions;
using OrderingService.Checkout;
using OrderingService.Domain;
using OrderingService.Persistence;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-009: the allergens a customer chooses to tell the bakery about for one order. Checked against the catalog's registry (never the customer's profile),
/// part of the request fingerprint, fixed once the order is placed, carried by <c>OrderPlaced</c> and kept by the vendor read model. The privacy and
/// two-vendor properties are in <see cref="OrderAllergenApiTests"/>.
/// </summary>
public class OrderAllergenCheckoutTests
{
    private static CheckoutRequest WithAllergens(params string[] allergens) => Request() with { Allergens = [.. allergens] };

    private static OrderPlacedPayload PlacedPayload(CheckoutFixture f) =>
        Assert.IsType<OrderPlacedPayload>(Assert.Single(f.Events.Published, e => e.EventType == OrderEventTypes.Placed).Payload);

    // ---- recorded on the order ---------------------------------------------------------------------------

    [Fact]
    public async Task AnOrderWithNoAllergensHasNoneAndItsEventAndDocumentAreAsTheyAlwaysWere()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(Request());

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.Empty(result.Order!.Order.Allergens);
        Assert.Null(result.Order.Document.Allergens); // omitted from the stored JSON
        Assert.Null(PlacedPayload(f).Allergens);
        Assert.Equal(0, f.Catalog.AllergenReads); // the registry is not even asked when none are named
    }

    [Fact]
    public async Task SeveralAllergensAreStoredSortedAndDistinctAndTravelOnTheOrderPlacedEvent()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens("tree-nut", "dairy", "tree-nut", "sesame"));

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        var expected = new[] { "dairy", "sesame", "tree-nut" };
        Assert.Equal(expected, result.Order!.Order.Allergens);
        Assert.Equal(expected, result.Order.Document.Allergens);
        Assert.Equal(expected, PlacedPayload(f).Allergens);

        var stored = await f.Store.GetAsync(result.Order.Order.Id, "customer-1");
        Assert.Equal(expected, stored!.Order.Allergens); // survives the round trip through the store
    }

    [Fact]
    public async Task OneAllergenIsEnough()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens("peanut"));

        Assert.Equal(["peanut"], result.Order!.Order.Allergens);
    }

    // ---- refusals: nothing is stored, reserved or paid -----------------------------------------------------

    [Theory]
    [InlineData("vegan")] // a diet tag, not an allergen
    [InlineData("lupin")] // not in the registry (hidden, retired or never existed look the same to ordering)
    [InlineData("Dairy")] // ids are exact
    [InlineData("")]
    [InlineData("  ")]
    public async Task AnIdThatIsNotAnOfferedAllergenIs422NamingTheFieldAndNothingHappens(string id)
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens("dairy", id));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Equal("validation_failed", result.Code);
        Assert.Contains(result.Problems!, p => p.Field.StartsWith("allergens", StringComparison.Ordinal));
        Assert.Empty(f.Catalog.ReserveCalls);
        Assert.Empty(f.Payments.Requests);
        Assert.Empty(f.Events.Published);
    }

    [Fact]
    public async Task AnAllergenRetiredFromTheRegistryIsRefusedOnceTheCachedListExpires()
    {
        var f = new CheckoutFixture();
        Assert.Equal(CheckoutOutcome.Created, (await f.CheckoutAsync(WithAllergens("soy"))).Outcome);

        f.Catalog.Allergens.Remove("soy");
        f.Time.Now = f.Time.Now.AddMinutes(f.AllergenSettings.CacheMinutes + 1);
        var result = await f.CheckoutAsync(WithAllergens("soy"));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Equal("allergens[0]", Assert.Single(result.Problems!).Field);
    }

    [Fact]
    public async Task NamingMoreAllergensThanTheRegistryHoldsIsRefused()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens(Enumerable.Repeat("dairy", 10).ToArray()));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Contains(result.Problems!, p => p.Field == "allergens");
    }

    [Fact]
    public async Task AGiantListIsRefusedBeforeTheRegistryIsAsked()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens(Enumerable.Range(0, f.AllergenSettings.MaxRequestIds + 1).Select(i => $"x{i}").ToArray()));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
        Assert.Equal(0, f.Catalog.AllergenReads);
    }

    [Fact]
    public async Task AnIdTooLongToBeAnAllergenIsRefused()
    {
        var f = new CheckoutFixture();

        var result = await f.CheckoutAsync(WithAllergens(new string('a', 65)));

        Assert.Equal(CheckoutOutcome.Invalid, result.Outcome);
    }

    [Fact]
    public async Task WhenTheRegistryCannotBeReadACheckoutThatNamesAllergensIs503AndNothingIsRecordedUnchecked()
    {
        var f = new CheckoutFixture();
        f.Catalog.AllergenReadsFail = true;

        var result = await f.CheckoutAsync(WithAllergens("dairy"));

        Assert.Equal(CheckoutOutcome.Unavailable, result.Outcome);
        Assert.Empty(f.Catalog.ReserveCalls);
        Assert.Empty(f.Events.Published);
    }

    [Fact]
    public async Task ACheckoutThatNamesNoAllergensDoesNotDependOnTheRegistry()
    {
        var f = new CheckoutFixture();
        f.Catalog.AllergenReadsFail = true;

        Assert.Equal(CheckoutOutcome.Created, (await f.CheckoutAsync(Request())).Outcome);
    }

    // ---- the registry is the catalog's, and cached -----------------------------------------------------------

    [Fact]
    public async Task TheRegistryIsReadOnceForManyCheckoutsAndAgainAfterTheCacheExpires()
    {
        var f = new CheckoutFixture();

        await f.CheckoutAsync(WithAllergens("dairy"));
        await f.CheckoutAsync(WithAllergens("egg"));
        Assert.Equal(1, f.Catalog.AllergenReads);

        f.Time.Now = f.Time.Now.AddMinutes(f.AllergenSettings.CacheMinutes + 1);
        await f.CheckoutAsync(WithAllergens("fish"));
        Assert.Equal(2, f.Catalog.AllergenReads);
    }

    [Fact]
    public async Task ANewAllergenInTheRegistryIsAcceptedWithoutAnyChangeHere()
    {
        var f = new CheckoutFixture();
        Assert.Equal(CheckoutOutcome.Invalid, (await f.CheckoutAsync(WithAllergens("lupin"))).Outcome);

        f.Catalog.Allergens.Add("lupin"); // the catalog adds a tenth allergen
        f.Time.Now = f.Time.Now.AddMinutes(f.AllergenSettings.CacheMinutes + 1);

        var result = await f.CheckoutAsync(WithAllergens("lupin"));

        Assert.Equal(CheckoutOutcome.Created, result.Outcome);
        Assert.Equal(["lupin"], result.Order!.Order.Allergens);
    }

    // ---- idempotency: the allergens are part of what was asked -------------------------------------------------

    [Fact]
    public async Task TheSameKeyWithTheSameAllergensInAnyOrderReturnsTheOriginalOrder()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        var first = await f.CheckoutAsync(WithAllergens("dairy", "sesame"), key);

        var repeat = await f.CheckoutAsync(WithAllergens("sesame", "dairy", "dairy"), key);

        Assert.Equal(CheckoutOutcome.Existing, repeat.Outcome);
        Assert.Equal(first.Order!.Order.Id, repeat.Order!.Order.Id);
        Assert.Equal(["dairy", "sesame"], repeat.Order.Order.Allergens);
    }

    [Theory]
    [InlineData(new[] { "dairy" }, new[] { "egg" })]
    [InlineData(new[] { "dairy" }, new string[0])]
    [InlineData(new string[0], new[] { "dairy" })]
    [InlineData(new[] { "dairy", "egg" }, new[] { "dairy" })]
    public async Task TheSameKeyWithDifferentAllergensIsIdempotencyKeyReuse(string[] first, string[] second)
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        Assert.Equal(CheckoutOutcome.Created, (await f.CheckoutAsync(WithAllergens(first), key)).Outcome);

        var again = await f.CheckoutAsync(WithAllergens(second), key);

        Assert.Equal(CheckoutOutcome.KeyReuse, again.Outcome);
        Assert.Equal("idempotency_key_reuse", again.Code);
    }

    [Fact]
    public async Task AnEmptyListAndNoListAreTheSameRequest()
    {
        var f = new CheckoutFixture();
        var key = NewKey();
        await f.CheckoutAsync(Request(), key);

        var again = await f.CheckoutAsync(Request() with { Allergens = [] }, key);

        Assert.Equal(CheckoutOutcome.Existing, again.Outcome);
    }

    // ---- the order itself --------------------------------------------------------------------------------------

    [Fact]
    public async Task OnceAnOrderIsPlacedItsAllergensCannotChange()
    {
        var f = new CheckoutFixture();
        var order = (await f.CheckoutAsync(WithAllergens("dairy"))).Order!.Order;

        Assert.Throws<InvalidOrderTransitionException>(() => order.SetAllergens(["egg"], f.Time.Now));
        Assert.Equal(["dairy"], order.Allergens);
    }

    [Fact]
    public void AnOrderStoredBeforeAllergensExistedReadsAsHavingNone()
    {
        var doc = OrderDocument.From(OrderTestSupport.Placed());
        Assert.Null(doc.Allergens);

        Assert.Empty(doc.ToOrder().Allergens);
    }

    [Fact]
    public void TheDocumentOmitsAllergensWhenThereAreNone()
    {
        var json = Newtonsoft.Json.JsonConvert.SerializeObject(OrderDocument.From(OrderTestSupport.Placed()));

        Assert.DoesNotContain("allergens", json, StringComparison.Ordinal);
    }
}

/// <summary>WI-ORD-009: what the vendor read model does with the allergens of <c>OrderPlaced</c>.</summary>
public class OrderAllergenProjectionTests
{
    private const string OrderId = "order-1";
    private const string Vendor = "vendor-1";
    private static readonly DateTimeOffset T0 = new(2026, 11, 4, 12, 0, 0, TimeSpan.Zero);

    private readonly FakeRepository<VendorOrderDocument> _documents = new(d => d.Id);
    private readonly VendorOrderProjection _projection;

    public OrderAllergenProjectionTests() => _projection = new VendorOrderProjection(_documents, NullLogger<VendorOrderProjection>.Instance);

    private Task Placed(IReadOnlyList<string>? allergens, long seq = 1) =>
        _projection.OnPlacedAsync(new DomainEventEnvelope<OrderPlacedPayload>(
            Guid.NewGuid(), OrderEventTypes.Placed, 1, T0, "Order", OrderId, seq,
            new OrderPlacedPayload(OrderId, "customer-1", Vendor, [new LineItemPayload("l1", [], 1)], 800, "USD", Allergens: allergens)), default);

    private async Task<VendorOrderDocument> Read() => (await _documents.GetAsync(OrderId, Vendor))!;

    [Fact]
    public async Task AnOrderWithAllergensKeepsThemAndOneWithoutHasNone()
    {
        await Placed(["dairy", "sesame"]);
        Assert.Equal(["dairy", "sesame"], (await Read()).Allergens);

        var other = new FakeRepository<VendorOrderDocument>(d => d.Id);
        await new VendorOrderProjection(other, NullLogger<VendorOrderProjection>.Instance).OnPlacedAsync(
            new DomainEventEnvelope<OrderPlacedPayload>(Guid.NewGuid(), OrderEventTypes.Placed, 1, T0, "Order", "order-2", 1,
                new OrderPlacedPayload("order-2", "customer-1", Vendor, [new LineItemPayload("l1", [], 1)])), default);
        Assert.Null((await other.GetAsync("order-2", Vendor))!.Allergens);
    }

    [Fact]
    public async Task AReplayedOrLateEventNeverChangesWhatWasRecorded()
    {
        await Placed(["dairy"]);

        await Placed(["egg", "fish"]); // a redelivery that somehow differs
        await Placed(["dairy"]);
        await Placed(null);

        Assert.Equal(["dairy"], (await Read()).Allergens);
    }

    [Fact]
    public async Task LaterEventsLeaveTheAllergensAlone()
    {
        await Placed(["tree-nut"]);

        await _projection.OnConfirmedAsync(new DomainEventEnvelope<OrderConfirmedPayload>(
            Guid.NewGuid(), OrderEventTypes.Confirmed, 1, T0.AddMinutes(1), "Order", OrderId, 2,
            new OrderConfirmedPayload(OrderId, FulfillmentType.Pickup, null, false, Vendor, "customer-1")), default);
        await _projection.OnReadyForFulfillmentAsync(new DomainEventEnvelope<OrderReadyForFulfillmentPayload>(
            Guid.NewGuid(), OrderEventTypes.ReadyForFulfillment, 1, T0.AddMinutes(2), "Order", OrderId, 3,
            new OrderReadyForFulfillmentPayload(OrderId, Vendor, FulfillmentType.Pickup, FulfillmentDetails.ForPickup(T0.AddHours(1), T0.AddHours(1).AddMinutes(15)), "customer-1")), default);

        var doc = await Read();
        Assert.Equal(OrderStatus.ReadyForFulfillment, doc.Status);
        Assert.Equal(["tree-nut"], doc.Allergens); // still there while the order is ready, for the label or the staging
    }
}
