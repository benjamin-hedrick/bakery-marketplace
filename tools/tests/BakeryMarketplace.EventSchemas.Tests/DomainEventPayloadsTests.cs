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
    public void OrderPlacedPayload_TotalIsOptional_SoOlderMessagesStillDeserialize()
    {
        const string older = "{\"OrderId\":\"o-1\",\"CustomerId\":\"c-1\",\"VendorId\":\"v-1\",\"LineItems\":[]}";

        var payload = JsonSerializer.Deserialize<OrderPlacedPayload>(older);

        Assert.NotNull(payload);
        Assert.Null(payload.TotalCents);
        Assert.Null(payload.Currency);
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

    [Fact]
    public void OrderCancelledPayload_SerializesActorAndReasonAsReadableCodes()
    {
        var payload = new OrderCancelledPayload("order-7", OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined);

        var json = JsonSerializer.Serialize(payload);

        Assert.Contains("\"Vendor\"", json);
        Assert.Contains("\"VendorDeclined\"", json);
        var back = JsonSerializer.Deserialize<OrderCancelledPayload>(json);
        Assert.Equal(payload, back);
    }

    [Fact]
    public void OrderConfirmedAndPreparationStartedPayloads_RoundTrip()
    {
        var confirmed = JsonSerializer.Deserialize<OrderConfirmedPayload>(JsonSerializer.Serialize(new OrderConfirmedPayload("order-8")));
        var started = JsonSerializer.Deserialize<OrderPreparationStartedPayload>(JsonSerializer.Serialize(new OrderPreparationStartedPayload("order-8")));

        Assert.Equal("order-8", confirmed?.OrderId);
        Assert.Equal("order-8", started?.OrderId);
    }

    [Fact]
    public void OrderConfirmedPayload_CarriesFulfillmentDetailsAndStillReadsWithoutThem()
    {
        var start = new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero);
        var payload = new OrderConfirmedPayload("order-9", FulfillmentType.Pickup, FulfillmentDetails.ForPickup(start, start.AddMinutes(15)));

        var back = JsonSerializer.Deserialize<OrderConfirmedPayload>(JsonSerializer.Serialize(payload));

        Assert.Equal(start, back?.Details?.Pickup?.WindowStart);
        var older = JsonSerializer.Deserialize<OrderConfirmedPayload>("{\"OrderId\":\"order-9\"}");
        Assert.Null(older?.Details);
        Assert.Null(older?.FulfillmentType);
    }

    [Fact]
    public void OrderCancelReason_IsACodeSet_NotFreeText()
    {
        Assert.Equal(
            new[] { "CustomerRequested", "VendorDeclined", "VendorCancelled" },
            Enum.GetNames(typeof(OrderCancelReason)));
    }
}
