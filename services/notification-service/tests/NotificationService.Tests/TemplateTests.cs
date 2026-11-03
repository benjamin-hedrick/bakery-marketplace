using BakeryMarketplace.EventSchemas;
using NotificationService.Contacts;
using NotificationService.Processing;

namespace NotificationService.Tests;

public sealed class TemplateTests
{
    private static readonly TemplateMessageComposer Composer = new();
    private static readonly Contact Alice = new("c1", "alice@example.test", "Alice");
    private static readonly DateTimeOffset Start = new(2026, 11, 7, 9, 0, 0, TimeSpan.Zero);
    private static readonly FulfillmentDetails Window = FulfillmentDetails.ForPickup(Start, Start.AddMinutes(30), "ring the side bell, flat 4");

    private static (string Subject, string Body) Compose(object payload, string type, string orderId = "order-abc123xyz", Contact? to = null) =>
        Composer.Compose(new OrderEventInfo(Guid.NewGuid(), type, orderId, "c1", payload), to ?? Alice);

    [Fact]
    public void Placed_WithTotalAndWindow()
    {
        var (subject, body) = Compose(new OrderPlacedPayload("order-abc123xyz", "c1", "v1", [], 1250, "gbp", FulfillmentType.Pickup, Window), "OrderPlaced");

        Assert.Equal("We have your order 123XYZ", subject);
        Assert.Equal(
            "Hello Alice,\n\nThank you. We have received your order 123XYZ.\n\nTotal: 12.50 GBP.\n\nRequested pickup: Sat 7 Nov, 09:00 to 09:30 (UTC+00:00).\n\n" +
            "You will get a message when the bakery responds.\n\nBakery Marketplace", body);
    }

    [Fact]
    public void Placed_WithoutOptionalFields_DropsThoseSentencesRatherThanPrintingBlanks()
    {
        var (_, body) = Compose(new OrderPlacedPayload("order-abc123xyz", "c1", "v1", []), "OrderPlaced");

        Assert.DoesNotContain("Total", body);
        Assert.DoesNotContain("Requested pickup", body);
        Assert.DoesNotContain("  ", body);
        Assert.Contains("We have received your order 123XYZ", body);
    }

    [Fact]
    public void Confirmed_AutomaticVersusAcceptedByTheVendor()
    {
        var auto = Compose(new OrderConfirmedPayload("o", Automatic: true), "OrderConfirmed", "o");
        var vendor = Compose(new OrderConfirmedPayload("o", FulfillmentType.Pickup, Window), "OrderConfirmed", "o");

        Assert.Contains("Your order O is confirmed.", auto.Body);
        Assert.DoesNotContain("Pickup:", auto.Body);
        Assert.Contains("The bakery has accepted your order O.", vendor.Body);
        Assert.Contains("Pickup: Sat 7 Nov, 09:00 to 09:30", vendor.Body);
    }

    [Fact]
    public void PreparationStarted_AndCompleted()
    {
        Assert.Equal("Order 123XYZ is being prepared", Compose(new OrderPreparationStartedPayload("order-abc123xyz"), "OrderPreparationStarted").Subject);
        var done = Compose(new OrderCompletedPayload("order-abc123xyz", Start), "OrderCompleted");
        Assert.Equal("Order 123XYZ is complete", done.Subject);
        Assert.Contains("handed over", done.Body);
    }

    [Fact]
    public void Ready_ForPickupVersusOtherFulfillment_WithAndWithoutAWindow()
    {
        var pickup = Compose(new OrderReadyForFulfillmentPayload("o", "v1", FulfillmentType.Pickup, Window), "OrderReadyForFulfillment", "o");
        var bare = Compose(new OrderReadyForFulfillmentPayload("o", "v1", FulfillmentType.Pickup, new FulfillmentDetails(FulfillmentType.Pickup)), "OrderReadyForFulfillment", "o");
        var other = Compose(new OrderReadyForFulfillmentPayload("o", "v1", FulfillmentType.Delivery, new FulfillmentDetails(FulfillmentType.Delivery)), "OrderReadyForFulfillment", "o");

        Assert.Contains("is ready for pickup.", pickup.Body);
        Assert.Contains("Pickup window: Sat 7 Nov, 09:00 to 09:30", pickup.Body);
        Assert.DoesNotContain("window", bare.Body);
        Assert.Contains("Your order O is ready.", other.Body);
    }

    [Theory]
    [InlineData(OrderCancelReason.CustomerRequested, "was cancelled at your request")]
    [InlineData(OrderCancelReason.VendorDeclined, "could not accept order")]
    [InlineData(OrderCancelReason.VendorCancelled, "has cancelled order")]
    [InlineData((OrderCancelReason)99, "was cancelled.")]
    public void Cancelled_UsesFixedWordingPerReason(OrderCancelReason reason, string expected)
    {
        var (subject, body) = Compose(new OrderCancelledPayload("order-abc123xyz", OrderCancelActor.Vendor, reason), "OrderCancelled");

        Assert.Equal("Order 123XYZ was cancelled", subject);
        Assert.Contains(expected, body);
    }

    [Fact]
    public void PickupInstructions_AreFreeText_AndNeverCopiedIntoAMessage()
    {
        var all = new[]
        {
            Compose(new OrderPlacedPayload("o", "c1", "v1", [], Details: Window), "OrderPlaced"),
            Compose(new OrderConfirmedPayload("o", Details: Window), "OrderConfirmed"),
            Compose(new OrderReadyForFulfillmentPayload("o", "v1", FulfillmentType.Pickup, Window), "OrderReadyForFulfillment"),
        };

        Assert.All(all, m => { Assert.DoesNotContain("side bell", m.Body); Assert.DoesNotContain("flat 4", m.Body); });
    }

    [Fact]
    public void AMissingNameDropsTheNameNotTheGreeting()
    {
        var (_, body) = Compose(new OrderCompletedPayload("o", Start), "OrderCompleted", "o", new Contact("c1", "a@example.test", " "));

        Assert.StartsWith("Hello,\n\n", body);
    }

    [Fact]
    public void ShortOrderIdsAreUsedWhole()
    {
        Assert.Equal("AB12", TemplateMessageComposer.Reference("ab12"));
    }

    [Fact]
    public void ThePickupWindowShowsTheOffsetTheOrderCarries()
    {
        var start = new DateTimeOffset(2026, 7, 7, 9, 0, 0, TimeSpan.FromHours(1));
        var (_, body) = Compose(new OrderConfirmedPayload("o", Details: FulfillmentDetails.ForPickup(start, start.AddDays(1))), "OrderConfirmed", "o");

        Assert.Contains("Tue 7 Jul, 09:00 to Wed 8 Jul, 09:00 (UTC+01:00)", body);
    }

    [Fact]
    public void EveryEventTypeTheServiceSubscribesToHasATemplate_AndNothingElseDoes()
    {
        Assert.Equal(OrderEventSubscriptions.EventTypes.OrderBy(x => x), TemplateMessageComposer.SupportedEventTypes.OrderBy(x => x));
        Assert.Equal(6, OrderEventSubscriptions.EventTypes.Length);
    }

    [Fact]
    public void AnUnknownPayloadFailsLoudlyInsteadOfSendingAnEmptyMessage()
    {
        Assert.Throws<NotSupportedException>(() => Compose(new object(), "OrderSomethingNew"));
    }
}
