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

    [Fact]
    public void Subscribes_to_exactly_the_events_ordering_publishes()
    {
        Assert.Equal(OrderingEventTypes(), OrderEventSubscriptions.EventTypes.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public void Has_a_template_for_every_event_ordering_publishes()
    {
        Assert.Equal(OrderingEventTypes(), TemplateMessageComposer.SupportedEventTypes.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public void Every_event_type_has_a_payload_type_in_the_shared_schemas()
    {
        var payloads = typeof(OrderPlacedPayload).Assembly.GetTypes().Select(t => t.Name).ToHashSet();
        foreach (var eventType in OrderingEventTypes())
            Assert.Contains(eventType + "Payload", payloads);
    }
}
