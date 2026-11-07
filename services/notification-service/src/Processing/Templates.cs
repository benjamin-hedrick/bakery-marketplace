using System.Globalization;
using BakeryMarketplace.EventSchemas;
using NotificationService.Contacts;

namespace NotificationService.Processing;

/// <summary>
/// The wording of each order-lifecycle message (<c>NOT-002</c>). Plain text. Every field comes from the event payload alone; an optional
/// field that is missing drops its sentence. Nothing a person typed is copied in: the cancellation reason is a code with fixed wording, and
/// the pickup instructions (free text) are left out. The payloads carry no vendor name, so none is shown.
/// </summary>
public sealed class TemplateMessageComposer : IMessageComposer
{
    /// <summary>The event types that have a template. A test keeps this equal to what the service subscribes to.</summary>
    public static IReadOnlyCollection<string> SupportedEventTypes { get; } =
        ["OrderPlaced", "OrderConfirmed", "OrderPreparationStarted", FulfillmentEventTypes.ReadyForPickup, FulfillmentEventTypes.PickupWindowScheduled, "OrderCompleted", "OrderCancelled"];

    public (string Subject, string Body) Compose(OrderEventInfo info, Contact contact)
    {
        var reference = Reference(info.OrderId);
        var (subject, lines) = info.Payload switch
        {
            OrderPlacedPayload p => ($"We have your order {reference}", Placed(p, reference)),
            OrderConfirmedPayload p => ($"Order {reference} is confirmed", Confirmed(p, reference)),
            OrderPreparationStartedPayload => ($"Order {reference} is being prepared", [$"The bakery has started preparing order {reference}."]),
            PickupWindowScheduledPayload p => ($"Pickup for order {reference} is scheduled", Scheduled(p, reference)),
            OrderReadyForPickupPayload p => ($"Order {reference} is ready", Ready(p, reference)),
            OrderCompletedPayload => ($"Order {reference} is complete", [$"Order {reference} has been handed over. Thank you for ordering."]),
            OrderCancelledPayload p => ($"Order {reference} was cancelled", [Cancelled(p, reference)]),
            _ => throw new NotSupportedException($"There is no template for {info.EventType}."),
        };

        var greeting = string.IsNullOrWhiteSpace(contact.DisplayName) ? "Hello," : $"Hello {contact.DisplayName.Trim()},";
        return (subject, string.Join("\n\n", [greeting, .. lines, "Bakery Marketplace"]));
    }

    /// <summary>The last six characters of the order id, upper case: the same short reference the vendor sees (a copy, because the services are separate).</summary>
    public static string Reference(string orderId) => (orderId.Length <= 6 ? orderId : orderId[^6..]).ToUpperInvariant();

    private static string[] Placed(OrderPlacedPayload p, string reference)
    {
        var lines = new List<string> { $"Thank you. We have received your order {reference}." };
        if (p.TotalCents is { } cents && !string.IsNullOrWhiteSpace(p.Currency))
            lines.Add($"Total: {(cents / 100m).ToString("0.00", CultureInfo.InvariantCulture)} {p.Currency.Trim().ToUpperInvariant()}.");
        if (Window(p.Details) is { } window) lines.Add($"Requested pickup: {window}.");
        lines.Add("You will get a message when the bakery responds.");
        return [.. lines];
    }

    private static string[] Confirmed(OrderConfirmedPayload p, string reference)
    {
        var lines = new List<string> { p.Automatic
            ? $"Your order {reference} is confirmed."
            : $"The bakery has accepted your order {reference}." };
        if (Window(p.Details) is { } window) lines.Add($"Pickup: {window}.");
        return [.. lines];
    }

    // From the pickup strategy's events (WI-ORD-003). The instructions are free text and are left out, as before.
    private static string[] Scheduled(PickupWindowScheduledPayload p, string reference) =>
        [$"Your pickup for order {reference} is scheduled: {Window(p.WindowStart, p.WindowEnd)}."];

    private static string[] Ready(OrderReadyForPickupPayload p, string reference)
    {
        var lines = new List<string> { $"Your order {reference} is ready for pickup." };
        if (p.WindowStart is { } start && p.WindowEnd is { } end) lines.Add($"Pickup window: {Window(start, end)}.");
        return [.. lines];
    }

    private static string Cancelled(OrderCancelledPayload p, string reference) => p.Reason switch
    {
        OrderCancelReason.CustomerRequested => $"Order {reference} was cancelled at your request.",
        OrderCancelReason.VendorDeclined => $"The bakery could not accept order {reference}.",
        OrderCancelReason.VendorCancelled => $"The bakery has cancelled order {reference}.",
        _ => $"Order {reference} was cancelled.",
    };

    /// <summary>The pickup window as stored (the offset the order carries), or null when there is none.</summary>
    private static string? Window(FulfillmentDetails? details)
    {
        return details?.Pickup is { } pickup ? Window(pickup.WindowStart, pickup.WindowEnd) : null;
    }

    private static string Window(DateTimeOffset windowStart, DateTimeOffset windowEnd)
    {
        const string format = "ddd d MMM, HH:mm";
        var start = windowStart.ToString(format, CultureInfo.InvariantCulture);
        var end = windowEnd.ToString(windowEnd.Date == windowStart.Date ? "HH:mm" : format, CultureInfo.InvariantCulture);
        return $"{start} to {end} (UTC{windowStart:zzz})";
    }
}
