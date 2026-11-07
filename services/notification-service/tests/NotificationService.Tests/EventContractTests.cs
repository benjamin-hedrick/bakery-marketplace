extern alias ordering;

using System.Reflection;
using BakeryMarketplace.EventSchemas;
using NotificationService.Processing;
using OrderEventTypes = ordering::OrderingService.Domain.OrderEventTypes;

namespace NotificationService.Tests;

/// <summary>
/// The event names are strings on a broker, so a rename in ordering would silently stop notifications. These tests tie the names the
/// notification service subscribes to, and has templates for, to the names ordering publishes, and each name to a payload type in the
/// shared schemas. (The producer is referenced by this test project only, never by the service.)
/// </summary>
public sealed class EventContractTests
{
    private static string[] OrderingEventTypes() =>
        typeof(OrderEventTypes).GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.FlattenHierarchy)
            .Where(f => f.IsLiteral && f.FieldType == typeof(string))
            .Select(f => (string)f.GetRawConstantValue()!)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();

    // The customer-facing "ready" message follows the pickup strategy's events, not the order's own OrderReadyForFulfillment (WI-ORD-003),
    // and the strategy's "pickup window scheduled" has a message of its own.
    private static string[] Expected() =>
        OrderingEventTypes()
            .Where(t => t != "OrderReadyForFulfillment")
            .Concat([FulfillmentEventTypes.ReadyForPickup, FulfillmentEventTypes.PickupWindowScheduled])
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();

    [Fact]
    public void Subscribes_to_the_orders_lifecycle_events_and_the_pickup_strategys()
    {
        Assert.Equal(Expected(), OrderEventSubscriptions.EventTypes.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public void Has_a_template_for_every_event_it_subscribes_to()
    {
        Assert.Equal(Expected(), TemplateMessageComposer.SupportedEventTypes.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public void Every_event_type_has_a_payload_type_in_the_shared_schemas()
    {
        var payloads = typeof(OrderPlacedPayload).Assembly.GetTypes().Select(t => t.Name).ToHashSet();
        foreach (var eventType in Expected())
            Assert.Contains(eventType + "Payload", payloads);
    }
}
