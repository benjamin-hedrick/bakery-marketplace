using System.Text.Json;
using BakeryMarketplace.EventSchemas;

namespace BakeryMarketplace.EventSchemas.Tests;

/// <summary>
/// Unit tests for the FulfillmentStrategy seam contracts (WI-ORD-004, ADR-0001).
/// Verifies serialization, factory methods, discriminated shape handling, and enum representation.
/// </summary>
public class FulfillmentContractsTests
{
    [Fact]
    public void FulfillmentType_ContainsPickupAndDelivery()
    {
        Assert.True(Enum.IsDefined(typeof(FulfillmentType), FulfillmentType.Pickup));
        Assert.True(Enum.IsDefined(typeof(FulfillmentType), FulfillmentType.Delivery));
    }

    [Fact]
    public void OrderStatus_VocabularyMatchesGlossaryAndAdr0001()
    {
        var expectedNames = new[]
        {
            "Placed",
            "Confirmed",
            "InPreparation",
            "ReadyForFulfillment",
            "Completed",
            "Cancelled"
        };

        var actualNames = Enum.GetNames(typeof(OrderStatus));
        Assert.Equal(expectedNames, actualNames);
    }

    [Fact]
    public void FulfillmentDetails_ForPickup_SerializesAndDeserializesCorrectly()
    {
        var start = DateTimeOffset.UtcNow.AddHours(1);
        var end = start.AddHours(1);
        var details = FulfillmentDetails.ForPickup(start, end, "Leave at counter");

        Assert.Equal(FulfillmentType.Pickup, details.Type);
        Assert.NotNull(details.Pickup);
        Assert.Null(details.Delivery);
        Assert.Equal(start, details.Pickup.WindowStart);
        Assert.Equal(end, details.Pickup.WindowEnd);
        Assert.Equal("Leave at counter", details.Pickup.Instructions);

        var json = JsonSerializer.Serialize(details);
        var deserialized = JsonSerializer.Deserialize<FulfillmentDetails>(json);

        Assert.NotNull(deserialized);
        Assert.Equal(FulfillmentType.Pickup, deserialized.Type);
        Assert.NotNull(deserialized.Pickup);
        Assert.Equal(start, deserialized.Pickup.WindowStart);
        Assert.Equal(end, deserialized.Pickup.WindowEnd);
        Assert.Equal("Leave at counter", deserialized.Pickup.Instructions);
    }

    [Fact]
    public void FulfillmentDetails_ForDelivery_SerializesAndDeserializesCorrectly()
    {
        var eta = DateTimeOffset.UtcNow.AddMinutes(45);
        var details = FulfillmentDetails.ForDelivery("123 Main St, Apt 4B", courierId: "courier-77", estimatedDeliveryAt: eta, instructions: "Ring doorbell");

        Assert.Equal(FulfillmentType.Delivery, details.Type);
        Assert.Null(details.Pickup);
        Assert.NotNull(details.Delivery);
        Assert.Equal("123 Main St, Apt 4B", details.Delivery.Address);
        Assert.Equal("courier-77", details.Delivery.CourierId);
        Assert.Equal(eta, details.Delivery.EstimatedDeliveryAt);
        Assert.Equal("Ring doorbell", details.Delivery.Instructions);

        var json = JsonSerializer.Serialize(details);
        var deserialized = JsonSerializer.Deserialize<FulfillmentDetails>(json);

        Assert.NotNull(deserialized);
        Assert.Equal(FulfillmentType.Delivery, deserialized.Type);
        Assert.NotNull(deserialized.Delivery);
        Assert.Equal("123 Main St, Apt 4B", deserialized.Delivery.Address);
        Assert.Equal("courier-77", deserialized.Delivery.CourierId);
    }

    [Fact]
    public void OrderReadyForFulfillmentPayload_SerializationRoundtrip_Succeeds()
    {
        var start = DateTimeOffset.UtcNow.AddMinutes(30);
        var end = start.AddMinutes(30);
        var details = FulfillmentDetails.ForPickup(start, end, "Order #42");

        var payload = new OrderReadyForFulfillmentPayload("ord-100", "vendor-10", FulfillmentType.Pickup, details);

        Assert.Equal("ord-100", payload.OrderId);
        Assert.Equal("vendor-10", payload.VendorId);
        Assert.Equal(FulfillmentType.Pickup, payload.FulfillmentType);

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<OrderReadyForFulfillmentPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("ord-100", deserialized.OrderId);
        Assert.Equal("vendor-10", deserialized.VendorId);
        Assert.Equal(FulfillmentType.Pickup, deserialized.FulfillmentType);
        Assert.NotNull(deserialized.Details.Pickup);
        Assert.Equal(start, deserialized.Details.Pickup.WindowStart);
    }

    [Fact]
    public void OrderFulfillmentCompletedPayload_SerializationRoundtrip_Succeeds()
    {
        var now = DateTimeOffset.UtcNow;
        var payload = new OrderFulfillmentCompletedPayload("ord-200", "vendor-10", FulfillmentType.Pickup, now);

        Assert.Equal("ord-200", payload.OrderId);
        Assert.Equal("vendor-10", payload.VendorId);
        Assert.Equal(FulfillmentType.Pickup, payload.FulfillmentType);
        Assert.Equal(now, payload.CompletedAt);

        var json = JsonSerializer.Serialize(payload);
        var deserialized = JsonSerializer.Deserialize<OrderFulfillmentCompletedPayload>(json);

        Assert.NotNull(deserialized);
        Assert.Equal("ord-200", deserialized.OrderId);
        Assert.Equal(now, deserialized.CompletedAt);
    }
}
