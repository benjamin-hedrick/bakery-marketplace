using BakeryMarketplace.EventSchemas;

namespace OrderingService.Domain;

/// <summary>
/// The Order aggregate (WI-ORD-002): lifecycle, invariants and the events each transition raises. Behaviour is specified in
/// docs/architecture/order-lifecycle.md. It is in-memory only: persistence is <c>ORD-006</c>, publishing is <c>ORD-005</c>.
/// <para>
/// Fulfillment-agnostic (ADR-0001): <see cref="Fulfillment"/> is stored opaquely; only the pickup window is read out, to raise
/// <c>PickupWindowScheduled</c>. Time is always passed in, so nothing here reads the wall clock. Who may call a transition
/// (a vendor only for their own orders, and so on) is authorization and belongs to the service layer; the aggregate checks only
/// status rules and, for cancellation, the actor.
/// </para>
/// <para>
/// <see cref="SequenceNumber"/> counts raised events, not transitions, so consumers see no gaps (ADR-0003). Edits while
/// <see cref="OrderStatus.Pending"/> raise nothing and leave it at 0.
/// </para>
/// </summary>
public sealed class Order
{
    private readonly List<OrderLine> _lines = [];
    private readonly List<OrderEvent> _events = [];

    private Order(string id, string customerId, string vendorId, FulfillmentType fulfillmentType, DateTimeOffset now)
    {
        Id = id;
        CustomerId = customerId;
        VendorId = vendorId;
        FulfillmentType = fulfillmentType;
        Status = OrderStatus.Pending;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public string Id { get; }
    public string CustomerId { get; }
    public string VendorId { get; }
    public FulfillmentType FulfillmentType { get; }
    public FulfillmentDetails? Fulfillment { get; private set; }
    public OrderStatus Status { get; private set; }
    public long SequenceNumber { get; private set; }
    public DateTimeOffset CreatedAt { get; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public OrderCancelActor? CancelledBy { get; private set; }
    public OrderCancelReason? CancelReason { get; private set; }

    public string Currency => OrderRules.Currency;
    public IReadOnlyList<OrderLine> Lines => _lines.AsReadOnly();
    public long TotalCents => _lines.Sum(l => l.LineCents);

    public static Order Create(string id, string customerId, string vendorId, FulfillmentType fulfillmentType, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(id)) throw new OrderRuleException("An order needs an id.");
        if (string.IsNullOrWhiteSpace(customerId)) throw new OrderRuleException("An order needs a customer.");
        if (string.IsNullOrWhiteSpace(vendorId)) throw new OrderRuleException("An order needs a vendor.");
        return new Order(id, customerId, vendorId, fulfillmentType, now);
    }

    // ---- building the order (Pending only) -------------------------------------------------------------------------

    public void AddLine(OrderLine line, DateTimeOffset now)
    {
        RequirePending("add a line");
        ArgumentNullException.ThrowIfNull(line);
        if (_lines.Count >= OrderRules.MaxLines) throw new OrderRuleException($"An order can have at most {OrderRules.MaxLines} lines.");
        _lines.Add(line);
        UpdatedAt = now;
    }

    public void RemoveLine(int index, DateTimeOffset now)
    {
        RequirePending("remove a line");
        if (index < 0 || index >= _lines.Count) throw new OrderRuleException("There is no such line.");
        _lines.RemoveAt(index);
        UpdatedAt = now;
    }

    /// <summary>Sets (or, with null, clears) the fulfillment details. A pickup window is optional: not every vendor or item uses one.</summary>
    public void SetFulfillmentDetails(FulfillmentDetails? details, DateTimeOffset now)
    {
        RequirePending("change the fulfillment details");
        if (details is not null && details.Type != FulfillmentType)
            throw new OrderRuleException($"These details are for {details.Type}, but the order is {FulfillmentType}.");
        Fulfillment = details;
        UpdatedAt = now;
    }

    // ---- lifecycle -----------------------------------------------------------------------------------------------------

    /// <summary>The customer places the order; it now waits for the vendor.</summary>
    public void Place(DateTimeOffset now)
    {
        Require(OrderStatus.Pending, "place");
        if (_lines.Count == 0) throw new OrderRuleException("An order needs at least one line before it can be placed.");

        Status = OrderStatus.Placed;
        Raise(OrderEventTypes.Placed, new OrderPlacedPayload(
            Id, CustomerId, VendorId,
            _lines.Select(l => new LineItemPayload(l.ListingId, l.ModifierIds, l.Quantity)).ToList()), now);
    }

    /// <summary>The vendor accepts the order. A requested pickup window is scheduled with it.</summary>
    public void Confirm(DateTimeOffset now)
    {
        Require(OrderStatus.Placed, "confirm");

        Status = OrderStatus.Confirmed;
        Raise(OrderEventTypes.Confirmed, new OrderConfirmedPayload(Id), now);
        if (Fulfillment?.Pickup is { } window)
        {
            Raise(OrderEventTypes.PickupWindowScheduled,
                new PickupWindowScheduledPayload(Id, window.WindowStart, window.WindowEnd), now);
        }
    }

    public void StartPreparation(DateTimeOffset now)
    {
        Require(OrderStatus.Confirmed, "start preparing");

        Status = OrderStatus.InPreparation;
        Raise(OrderEventTypes.PreparationStarted, new OrderPreparationStartedPayload(Id), now);
    }

    public void MarkReady(DateTimeOffset now)
    {
        Require(OrderStatus.InPreparation, "mark ready");

        Status = OrderStatus.ReadyForFulfillment;
        Raise(OrderEventTypes.ReadyForPickup, new OrderReadyForPickupPayload(Id), now);
    }

    public void Complete(DateTimeOffset now)
    {
        Require(OrderStatus.ReadyForFulfillment, "complete");

        Status = OrderStatus.Completed;
        Raise(OrderEventTypes.Completed, new OrderCompletedPayload(Id, now), now);
    }

    /// <summary>
    /// Cancels the order. Allowed combinations (docs/architecture/order-lifecycle.md): the customer while Placed or Confirmed;
    /// the vendor from Placed (a decline, <see cref="OrderCancelReason.VendorDeclined"/>) and from Confirmed, InPreparation or
    /// ReadyForFulfillment (<see cref="OrderCancelReason.VendorCancelled"/>); the system from Placed when the vendor never answered.
    /// </summary>
    public void Cancel(OrderCancelActor actor, OrderCancelReason reason, DateTimeOffset now)
    {
        if (!IsCancellationAllowed(Status, actor, reason))
        {
            throw new InvalidOrderTransitionException(
                $"A {actor} cannot cancel a {Status} order with reason {reason}.");
        }

        Status = OrderStatus.Cancelled;
        CancelledBy = actor;
        CancelReason = reason;
        Raise(OrderEventTypes.Cancelled, new OrderCancelledPayload(Id, actor, reason), now);
    }

    /// <summary>Returns the events raised since the last call, oldest first, and forgets them.</summary>
    public IReadOnlyList<OrderEvent> DequeueEvents()
    {
        var events = _events.ToArray();
        _events.Clear();
        return events;
    }

    // ---- internals -------------------------------------------------------------------------------------------------------

    private static bool IsCancellationAllowed(OrderStatus status, OrderCancelActor actor, OrderCancelReason reason) =>
        (status, actor, reason) switch
        {
            (OrderStatus.Placed, OrderCancelActor.Customer, OrderCancelReason.CustomerRequested) => true,
            (OrderStatus.Placed, OrderCancelActor.Vendor, OrderCancelReason.VendorDeclined) => true,
            (OrderStatus.Placed, OrderCancelActor.System, OrderCancelReason.ResponseTimeout) => true,
            (OrderStatus.Confirmed, OrderCancelActor.Customer, OrderCancelReason.CustomerRequested) => true,
            (OrderStatus.Confirmed or OrderStatus.InPreparation or OrderStatus.ReadyForFulfillment,
                OrderCancelActor.Vendor, OrderCancelReason.VendorCancelled) => true,
            _ => false,
        };

    private void Require(OrderStatus expected, string action)
    {
        if (Status != expected)
            throw new InvalidOrderTransitionException($"Cannot {action} an order that is {Status}; it must be {expected}.");
    }

    private void RequirePending(string action)
    {
        if (Status != OrderStatus.Pending)
            throw new InvalidOrderTransitionException($"Cannot {action} once the order is {Status}; only a Pending order can be edited.");
    }

    private void Raise(string eventType, object payload, DateTimeOffset now)
    {
        SequenceNumber++;
        UpdatedAt = now;
        _events.Add(new OrderEvent(eventType, payload, SequenceNumber, now));
    }
}
