using System.Net;
using System.Reflection;
using System.Text.Json;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.DependencyInjection;
using OrderingService.Domain;
using OrderingService.Fulfillment;
using OrderingService.Orders;
using static OrderingService.Tests.OrderingFactory;

namespace OrderingService.Tests;

/// <summary>
/// WI-ORD-003 (ADR-0001): the pickup strategy is its own consumer, "handed over" is a request the strategy answers, and the Ordering core
/// completes the order only on the strategy's event. Unit tests with the transport stood in for, then the whole path over HTTP.
/// </summary>
public class FulfillmentSeamTests
{
    private static readonly OrderCaller TheVendor = new(Seed.Vendor, IsVendor: true, IsCustomer: false);
    private static readonly OrderCaller OtherVendor = new("vendor-other", IsVendor: true, IsCustomer: false);
    private static readonly OrderCaller TheCustomer = new("customer-1", IsVendor: false, IsCustomer: true);

    private static DomainEventEnvelope<T> Envelope<T>(string type, T payload, Guid? id = null) =>
        new(id ?? Guid.NewGuid(), type, 1, new DateTimeOffset(2026, 1, 15, 12, 0, 0, TimeSpan.Zero), "Order", "order-1", 3, payload);

    private static readonly FulfillmentDetails Window = FulfillmentDetails.ForPickup(Seed.WindowStart, Seed.WindowEnd, "Ring the bell");

    private static async Task<string> ReadyOrderAsync(CheckoutFixture f)
    {
        var id = (await f.CheckoutAsync()).Order!.Order.Id;
        foreach (var step in new[] { OrderAction.Confirm, OrderAction.StartPreparation, OrderAction.MarkReady })
            Assert.Equal(OrderActionOutcome.Done, (await f.Actions.ActAsync(id, TheVendor, step)).Outcome);
        return id;
    }

    private static async Task<Order> StoredAsync(CheckoutFixture f, string id) => (await f.Store.GetAsync(id, "customer-1"))!.Order;

    // ---- the strategy ---------------------------------------------------------------------------------

    [Fact]
    public async Task ConfirmingAPickupOrderWithAWindowSchedulesThatWindow()
    {
        var events = new RecordingEvents();
        var strategy = new PickupFulfillment(events);
        var trigger = Envelope(OrderEventTypes.Confirmed, new OrderConfirmedPayload("order-1", FulfillmentType.Pickup, Window, false, "vendor-1", "customer-1"));

        await strategy.OnConfirmedAsync(trigger, default);

        var published = Assert.Single(events.Published);
        Assert.Equal(FulfillmentEventTypes.PickupWindowScheduled, published.EventType);
        var payload = Assert.IsType<PickupWindowScheduledPayload>(published.Payload);
        Assert.Equal(("order-1", Seed.WindowStart, Seed.WindowEnd, "vendor-1", "customer-1"), (payload.OrderId, payload.WindowStart, payload.WindowEnd, payload.VendorId, payload.CustomerId));
    }

    [Fact]
    public async Task ADeliveryOrderAndAPickupOrderWithoutAWindowAreLeftAlone()
    {
        var events = new RecordingEvents();
        var strategy = new PickupFulfillment(events);

        await strategy.OnConfirmedAsync(Envelope(OrderEventTypes.Confirmed, new OrderConfirmedPayload("o", FulfillmentType.Pickup, null)), default);
        await strategy.OnConfirmedAsync(Envelope(OrderEventTypes.Confirmed, new OrderConfirmedPayload("o", FulfillmentType.Pickup, new FulfillmentDetails(FulfillmentType.Pickup))), default);
        await strategy.OnConfirmedAsync(Envelope(OrderEventTypes.Confirmed, new OrderConfirmedPayload("o", FulfillmentType.Delivery, FulfillmentDetails.ForDelivery("1 Main St"))), default);
        await strategy.OnReadyForFulfillmentAsync(Envelope(OrderEventTypes.ReadyForFulfillment,
            new OrderReadyForFulfillmentPayload("o", "v", FulfillmentType.Delivery, FulfillmentDetails.ForDelivery("1 Main St"))), default);
        await strategy.OnConfirmationRequestedAsync(Envelope(FulfillmentEventTypes.ConfirmationRequested,
            new OrderFulfillmentConfirmationRequestedPayload("o", "v", "c", FulfillmentType.Delivery, DateTimeOffset.UtcNow)), default);

        Assert.Empty(events.Published);
    }

    [Fact]
    public async Task AnOrderReadyForPickupIsAnnouncedWithItsWindowAndInstructions()
    {
        var events = new RecordingEvents();
        var strategy = new PickupFulfillment(events);

        await strategy.OnReadyForFulfillmentAsync(Envelope(OrderEventTypes.ReadyForFulfillment,
            new OrderReadyForFulfillmentPayload("order-1", "vendor-1", FulfillmentType.Pickup, Window, "customer-1")), default);

        var payload = Assert.IsType<OrderReadyForPickupPayload>(Assert.Single(events.Published).Payload);
        Assert.Equal(("order-1", "vendor-1", "customer-1", Seed.WindowStart, Seed.WindowEnd, "Ring the bell"),
            (payload.OrderId, payload.VendorId, payload.CustomerId, payload.WindowStart, payload.WindowEnd, payload.Instructions));
    }

    [Fact]
    public async Task ARedeliveredTriggerPublishesTheSameEventIdAndADifferentTriggerAnotherOne()
    {
        var events = new RecordingEvents();
        var strategy = new PickupFulfillment(events);
        var trigger = Envelope(OrderEventTypes.ReadyForFulfillment, new OrderReadyForFulfillmentPayload("o", "v", FulfillmentType.Pickup, Window, "c"));

        await strategy.OnReadyForFulfillmentAsync(trigger, default);
        await strategy.OnReadyForFulfillmentAsync(trigger, default);
        await strategy.OnReadyForFulfillmentAsync(Envelope(OrderEventTypes.ReadyForFulfillment, trigger.Payload), default);

        var ids = events.Published.Select(p => p.EventId).ToList();
        Assert.Equal(ids[0], ids[1]);
        Assert.NotEqual(ids[0], ids[2]);
    }

    [Fact]
    public async Task APickupConfirmationIsAcceptedWithTheRequestsOwnTime()
    {
        var events = new RecordingEvents();
        var strategy = new PickupFulfillment(events);
        var requestedAt = new DateTimeOffset(2026, 1, 15, 15, 0, 0, TimeSpan.Zero);

        await strategy.OnConfirmationRequestedAsync(Envelope(FulfillmentEventTypes.ConfirmationRequested,
            new OrderFulfillmentConfirmationRequestedPayload("order-1", "vendor-1", "customer-1", FulfillmentType.Pickup, requestedAt)), default);

        var payload = Assert.IsType<OrderFulfillmentCompletedPayload>(Assert.Single(events.Published).Payload);
        Assert.Equal(("order-1", "vendor-1", FulfillmentType.Pickup, requestedAt), (payload.OrderId, payload.VendorId, payload.FulfillmentType, payload.CompletedAt));
    }

    // ---- the request ("handed over") ----------------------------------------------------------------------

    [Fact]
    public async Task HandingOverPublishesARequestAndChangesNothingInTheOrder()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);
        var before = f.Events.Published.Count;

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete);

        Assert.Equal(OrderActionOutcome.Accepted, result.Outcome);
        Assert.Equal(OrderStatus.ReadyForFulfillment, result.Order!.Order.Status);
        Assert.Equal(OrderStatus.ReadyForFulfillment, (await StoredAsync(f, id)).Status);
        var request = Assert.Single(f.Events.Published.Skip(before));
        Assert.Equal(FulfillmentEventTypes.ConfirmationRequested, request.EventType);
        var payload = Assert.IsType<OrderFulfillmentConfirmationRequestedPayload>(request.Payload);
        Assert.Equal((id, Seed.Vendor, "customer-1", FulfillmentType.Pickup), (payload.OrderId, payload.VendorId, payload.CustomerId, payload.FulfillmentType));
        Assert.Empty((await f.Store.GetAsync(id, "customer-1"))!.Document.Outbox); // a plain integration event: no outbox entry
    }

    [Theory]
    [InlineData(OrderStatus.Placed)]
    [InlineData(OrderStatus.Confirmed)]
    [InlineData(OrderStatus.InPreparation)]
    public async Task HandingOverAnOrderThatIsNotReadyIsAConflict(OrderStatus status)
    {
        var f = new CheckoutFixture();
        var id = (await f.CheckoutAsync()).Order!.Order.Id;
        var steps = new[] { OrderAction.Confirm, OrderAction.StartPreparation };
        foreach (var step in steps.Take(status == OrderStatus.Placed ? 0 : status == OrderStatus.Confirmed ? 1 : 2)) await f.Actions.ActAsync(id, TheVendor, step);

        var result = await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete);

        Assert.Equal(OrderActionOutcome.Conflict, result.Outcome);
        Assert.Equal(status, result.CurrentStatus);
        Assert.DoesNotContain(f.Events.Published, p => p.EventType == FulfillmentEventTypes.ConfirmationRequested);
    }

    [Fact]
    public async Task AnotherVendorsOrCustomersHandOverIsNotFoundAndPublishesNothing()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);

        Assert.Equal(OrderActionOutcome.NotFound, (await f.Actions.ActAsync(id, OtherVendor, OrderAction.Complete)).Outcome);
        Assert.Equal(OrderActionOutcome.NotFound, (await f.Actions.ActAsync(id, TheCustomer, OrderAction.Complete)).Outcome);
        Assert.DoesNotContain(f.Events.Published, p => p.EventType == FulfillmentEventTypes.ConfirmationRequested);
    }

    [Fact]
    public async Task AFailedPublishFailsTheRequestAndTheVendorCanPressAgain()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);
        f.Events.FailOnlyType = FulfillmentEventTypes.ConfirmationRequested;

        await Assert.ThrowsAsync<InvalidOperationException>(() => f.Actions.ActAsync(id, TheVendor, OrderAction.Complete));
        Assert.Equal(OrderStatus.ReadyForFulfillment, (await StoredAsync(f, id)).Status);

        f.Events.FailOnlyType = null;
        Assert.Equal(OrderActionOutcome.Accepted, (await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete)).Outcome);
    }

    // ---- the order's side -------------------------------------------------------------------------------

    [Fact]
    public async Task TwoPressesGiveOneCompletion()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);

        Assert.Equal(OrderActionOutcome.Accepted, (await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete)).Outcome);
        Assert.Equal(OrderActionOutcome.Accepted, (await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete)).Outcome); // both before the answer arrives
        await f.DeliverFulfillmentEventsAsync();

        Assert.Equal(OrderStatus.Completed, (await StoredAsync(f, id)).Status);
        Assert.Single(f.Events.Published, p => p.EventType == OrderEventTypes.Completed);
    }

    [Fact]
    public async Task ADuplicateDeliveryOfTheAnswerChangesNothing()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);
        await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete);

        await f.DeliverFulfillmentEventsAsync();
        var sequence = (await StoredAsync(f, id)).SequenceNumber;
        await f.DeliverFulfillmentEventsAsync();

        Assert.Equal(sequence, (await StoredAsync(f, id)).SequenceNumber);
        Assert.Single(f.Events.Published, p => p.EventType == OrderEventTypes.Completed);
    }

    [Fact]
    public async Task AnOrderCancelledBeforeTheAnswerArrivesStaysCancelled()
    {
        var f = new CheckoutFixture();
        var id = await ReadyOrderAsync(f);
        await f.Actions.ActAsync(id, TheVendor, OrderAction.Complete);
        Assert.Equal(OrderActionOutcome.Done, (await f.Actions.ActAsync(id, TheVendor, OrderAction.Cancel)).Outcome);

        await f.DeliverFulfillmentEventsAsync();

        Assert.Equal(OrderStatus.Cancelled, (await StoredAsync(f, id)).Status);
        Assert.DoesNotContain(f.Events.Published, p => p.EventType == OrderEventTypes.Completed);
    }

    [Fact]
    public async Task AnAnswerForAnUnknownOrderIsIgnored()
    {
        var f = new CheckoutFixture();

        await f.CompletionHandler.OnCompletedAsync(
            Envelope(FulfillmentEventTypes.Completed, new OrderFulfillmentCompletedPayload("no-such-order", Seed.Vendor, FulfillmentType.Pickup, DateTimeOffset.UtcNow)), default);

        Assert.Empty(f.Events.Published);
    }

    // ---- the seam -----------------------------------------------------------------------------------------

    [Fact]
    public void TheOrderingCoreHasNoReferenceToTheStrategy()
    {
        // Orders, Checkout and Domain may know the seam's events (EventSchemas) but nothing in OrderingService.Fulfillment.
        var assembly = typeof(Order).Assembly;
        var core = assembly.GetTypes().Where(t => t.Namespace is "OrderingService.Orders" or "OrderingService.Checkout" or "OrderingService.Domain").ToList();
        Assert.NotEmpty(core);

        const BindingFlags all = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        static bool InStrategy(Type? t) => t is not null && (t.Namespace == "OrderingService.Fulfillment" || InStrategy(t.GetElementType()) || t.GenericTypeArguments.Any(InStrategy));

        foreach (var type in core)
        {
            var used = new List<Type?> { type.BaseType };
            used.AddRange(type.GetInterfaces());
            foreach (var f in type.GetFields(all)) used.Add(f.FieldType);
            foreach (var p in type.GetProperties(all)) used.Add(p.PropertyType);
            foreach (var m in type.GetMethods(all).Cast<MethodBase>().Concat(type.GetConstructors(all)))
            {
                if (m is MethodInfo mi) used.Add(mi.ReturnType);
                used.AddRange(m.GetParameters().Select(p => p.ParameterType));
                used.AddRange(m.GetMethodBody()?.LocalVariables.Select(v => v.LocalType) ?? []);
            }
            Assert.DoesNotContain(used, InStrategy);
        }
    }

    [Fact]
    public async Task TheWholePathRunsOverTheEventContractAlone()
    {
        var secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
        await using var catalog = new FakeCatalogServer(secret);
        await using var factory = new OrderingFactory(catalog, secret);
        using var customer = factory.CustomerClient("customer-1");
        using var vendor = factory.ClientWithRole(Seed.Vendor, "Vendor");

        // A probe beside the service's own consumers: what the notification service would see.
        var seen = new List<string>();
        var subscriber = factory.Services.GetRequiredService<IEventSubscriber>();
        // (The in-memory transport matches handlers by payload type, so each event type gets its own typed probe.)
        Task Note<T>(DomainEventEnvelope<T> e, CancellationToken _) { lock (seen) seen.Add(e.EventType); return Task.CompletedTask; }
        await subscriber.SubscribeAsync<PickupWindowScheduledPayload>(FulfillmentEventTypes.PickupWindowScheduled, Note);
        await subscriber.SubscribeAsync<OrderReadyForPickupPayload>(FulfillmentEventTypes.ReadyForPickup, Note);
        await subscriber.SubscribeAsync<OrderFulfillmentCompletedPayload>(FulfillmentEventTypes.Completed, Note);
        await subscriber.SubscribeAsync<OrderCompletedPayload>(OrderEventTypes.Completed, Note);

        var placed = await PostCheckout(customer, new
        {
            vendorId = Seed.Vendor,
            paymentMethodId = "pm-ok",
            lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
            pickupWindow = new { start = Seed.WindowStart, end = Seed.WindowEnd },
        });
        Assert.Equal(HttpStatusCode.Created, placed.StatusCode);
        var id = JsonDocument.Parse(await placed.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetString()!;

        foreach (var action in new[] { "confirm", "start-preparation", "ready" })
            Assert.Equal(HttpStatusCode.OK, (await vendor.PostAsync($"/ordering/orders/{id}/{action}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await vendor.PostAsync($"/ordering/orders/{id}/complete", null)).StatusCode);

        for (var i = 0; i < 100; i++)
        {
            lock (seen) if (seen.Contains(OrderEventTypes.Completed)) break;
            await Task.Delay(50);
        }

        lock (seen)
        {
            // The in-memory transport delivers nested, so the order's own handler may finish before this probe hears the strategy's answer:
            // the first two come in order, and both of the last two come after them.
            Assert.Equal([FulfillmentEventTypes.PickupWindowScheduled, FulfillmentEventTypes.ReadyForPickup], seen.Take(2));
            Assert.Equal(new[] { FulfillmentEventTypes.Completed, OrderEventTypes.Completed }.Order(), seen.Skip(2).Order());
        }
    }
}
