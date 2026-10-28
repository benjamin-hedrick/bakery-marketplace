using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using static OrderingService.Tests.OrderTestSupport;

namespace OrderingService.Tests;

/// <summary>Building a Pending order (customization is part of this, not a change to a placed order) and the D-5 / D-1 invariants.</summary>
public class OrderBuildingTests
{
    private static Order Empty() => Order.Create("order-2", "customer-1", "vendor-1", FulfillmentType.Pickup, T0);

    [Fact]
    public void CreateStartsPendingWithNoLinesAndNoEvents()
    {
        var order = Empty();

        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Equal(FulfillmentType.Pickup, order.FulfillmentType);
        Assert.Empty(order.Lines);
        Assert.Equal(0, order.TotalCents);
        Assert.Equal("USD", order.Currency);
    }

    [Theory]
    [InlineData("", "customer-1", "vendor-1")]
    [InlineData("order-2", " ", "vendor-1")]
    [InlineData("order-2", "customer-1", "")]
    public void CreateRequiresIds(string id, string customer, string vendor) =>
        Assert.Throws<OrderRuleException>(() => Order.Create(id, customer, vendor, FulfillmentType.Pickup, T0));

    [Fact]
    public void TotalsAreIntegerCentsAndAddUp()
    {
        var order = Empty();
        order.AddLine(Line(quantity: 2, unitCents: 900, modifiers: ["mod-seeds"]), At(1)); // 2 x 900 = 1800
        order.AddLine(Line("listing-croissant-001", quantity: 1, unitCents: 525), At(1)); // 525
        order.AddLine(Line("listing-latte-001", quantity: 3, unitCents: 625), At(1)); // 1875

        Assert.Equal(1800L, order.Lines[0].LineCents);
        Assert.Equal(4200L, order.TotalCents);
    }

    [Fact]
    public void TheTotalDoesNotOverflowAtTheLimits()
    {
        var order = Empty();
        for (var i = 0; i < OrderRules.MaxLines; i++)
        {
            order.AddLine(Line($"listing-{i}", OrderRules.MaxQuantityPerLine, 10_000_000), At(1));
        }

        Assert.Equal(10L * 20 * 10_000_000, order.TotalCents);
    }

    [Fact]
    public void LinesCanBeRemovedAndTheTotalFollows()
    {
        var order = Pending();
        order.AddLine(Line("listing-croissant-001", 1, 525), At(2));

        order.RemoveLine(0, At(3));

        Assert.Single(order.Lines);
        Assert.Equal(525L, order.TotalCents);
        Assert.Equal(At(3), order.UpdatedAt);
    }

    [Fact]
    public void RemovingAMissingLineThrows()
    {
        var order = Pending();
        Assert.Throws<OrderRuleException>(() => order.RemoveLine(5, At(2)));
        Assert.Throws<OrderRuleException>(() => order.RemoveLine(-1, At(2)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(OrderRules.MaxQuantityPerLine + 1)]
    public void QuantityMustBeWithinTheLineLimits(int quantity) =>
        Assert.Throws<OrderRuleException>(() => Empty().AddLine(Line(quantity: quantity), At(1)));

    [Fact]
    public void AtMostTenLinesPerOrder()
    {
        var order = Empty();
        for (var i = 0; i < OrderRules.MaxLines; i++) order.AddLine(Line($"listing-{i}"), At(1));

        Assert.Throws<OrderRuleException>(() => order.AddLine(Line("one-too-many"), At(1)));
        Assert.Equal(OrderRules.MaxLines, order.Lines.Count);
    }

    [Fact]
    public void LineInputsAreValidated()
    {
        Assert.Throws<OrderRuleException>(() => Line(listing: " "));
        Assert.Throws<OrderRuleException>(() => Line(unitCents: -1));
        Assert.Throws<OrderRuleException>(() => Line(modifiers: ["mod-seeds", "mod-seeds"]));
        Assert.Throws<OrderRuleException>(() => Line(modifiers: [""]));
    }

    [Fact]
    public void ALineKeepsItsOwnCopyOfTheModifiers()
    {
        var modifiers = new List<string> { "mod-seeds" };
        var line = new OrderLine("listing-1", modifiers, 1, 100);

        modifiers.Add("mod-extra");

        Assert.Equal(new[] { "mod-seeds" }, line.ModifierIds);
    }

    [Fact]
    public void PlacingNeedsAtLeastOneLine()
    {
        var order = Empty();

        Assert.Throws<OrderRuleException>(() => order.Place(At(3)));
        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Empty(order.DequeueEvents());
    }

    [Fact]
    public void EditsAreOnlyPossibleWhilePending()
    {
        var order = In(OrderStatus.Placed);

        Assert.Throws<InvalidOrderTransitionException>(() => order.AddLine(Line(), At(9)));
        Assert.Throws<InvalidOrderTransitionException>(() => order.RemoveLine(0, At(9)));
        Assert.Throws<InvalidOrderTransitionException>(() => order.SetFulfillmentDetails(null, At(9)));
    }

    [Fact]
    public void EditingDoesNotRaiseEventsOrChangeTheSequence()
    {
        var order = Pending();

        Assert.Equal(0, order.SequenceNumber);
        Assert.Empty(order.DequeueEvents());
    }

    [Fact]
    public void AWindowIsOptionalAndCanBeCleared()
    {
        var order = Pending(withWindow: true);
        Assert.NotNull(order.Fulfillment?.Pickup);

        order.SetFulfillmentDetails(null, At(4));

        Assert.Null(order.Fulfillment);
    }

    [Fact]
    public void FulfillmentDetailsMustMatchTheOrdersFulfillmentType()
    {
        var order = Empty();
        var delivery = FulfillmentDetails.ForDelivery("1 Main St", null, null, null);

        Assert.Throws<OrderRuleException>(() => order.SetFulfillmentDetails(delivery, At(1)));
    }

    [Fact]
    public void TheLinesViewIsReadOnly()
    {
        var order = Pending();
        Assert.IsNotType<List<OrderLine>>(order.Lines);
    }
}
