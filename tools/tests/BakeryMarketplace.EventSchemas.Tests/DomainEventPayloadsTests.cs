using System.Text.Json;
using BakeryMarketplace.EventSchemas;

namespace BakeryMarketplace.EventSchemas.Tests;

/// <summary>
/// Unit tests for domain event payload C# records (TOOL-001).
/// </summary>
public class DomainEventPayloadsTests
{
    [Fact]
    public void OrderPlacedPayload_CanBeConstructedAndSerialized()
    {
        var lineItem = new LineItemPayload("listing-1", new[] { "mod-1", "mod-2" }, 2);
        var payload = new OrderPlacedPayload("order-100", "cust-1", "vendor-1", new[] { lineItem });

        Assert.Equal("order-100", payload.OrderId);
        Assert.Equal("cust-1", payload.CustomerId);
        Assert.Equal("vendor-1", payload.VendorId);
        Assert.Single(payload.LineItems);

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<OrderPlacedPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal(payload.OrderId, deserialized.OrderId);
        Assert.Equal(payload.LineItems.Count, deserialized.LineItems.Count);
    }

    [Fact]
    public void VendorSuspendedPayload_SerializationRoundtrip_Succeeds()
    {
        var payload = new VendorSuspendedPayload("vendor-42", "Violation of policy #4");

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<VendorSuspendedPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("vendor-42", deserialized.VendorId);
        Assert.Equal("Violation of policy #4", deserialized.Reason);
    }

    [Fact]
    public void PayoutReconciledPayload_PreservesDecimalPrecision()
    {
        var payload = new PayoutReconciledPayload("payout-1", "vendor-1", 149.99m);

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<PayoutReconciledPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal(149.99m, deserialized.NetAmount);
    }

    [Fact]
    public void ListingRejectedPayload_RoundtripsSuccessfully()
    {
        var payload = new ListingRejectedPayload("listing-99", "Inappropriate image content");

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<ListingRejectedPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("listing-99", deserialized.ListingId);
        Assert.Equal("Inappropriate image content", deserialized.Reason);
    }
}
