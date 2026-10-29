using OrderingService.Domain;

namespace OrderingService.Checkout;

/// <summary>Bound from the <c>Checkout</c> configuration section.</summary>
public sealed class CheckoutOptions
{
    /// <summary>
    /// Whether an order that needs nothing from the vendor confirms itself at checkout (<see cref="AutoConfirmPolicy"/>). A per-item or
    /// per-vendor control is the intended refinement; for now this is one switch.
    /// </summary>
    public bool AutoConfirm { get; set; } = true;
}

/// <summary>
/// WI-ORD-008 (human lead, 2026-10-28): an order with no customization and no requested pickup window needs no decision from the vendor,
/// so it confirms by itself at checkout. Anything with an option (a modifier on any line) or a requested window waits for the vendor, who
/// may need to prepare or schedule something special. The rule deliberately does not look at stock: whether an item has a counter or is
/// made to order does not change whether it needs the vendor's attention (that distinction belongs to a later per-item control).
/// </summary>
public static class AutoConfirmPolicy
{
    public static bool Qualifies(Order order) =>
        order.Fulfillment is null && order.Lines.Count > 0 && order.Lines.All(l => l.ModifierIds.Count == 0);
}
