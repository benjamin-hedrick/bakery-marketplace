using BakeryMarketplace.Eventing;

namespace BakeryMarketplace.Eventing.Tests;

/// <summary>
/// Shared contract test suite for all <see cref="IEventPublisher"/>/<see cref="IEventSubscriber"/> transport pairs.
/// A new implementation inherits by subclassing and overriding <see cref="CreateTransportPair"/>.
/// See WI-EVT-001 acceptance criteria.
/// </summary>
public abstract class EventTransportContractTests
{
    /// <summary>
    /// Factory that produces a matched publisher/subscriber pair backed by the transport under test.
    /// </summary>
    protected abstract (IEventPublisher Publisher, IEventSubscriber Subscriber) CreateTransportPair();

    private static DomainEventEnvelope<T> MakeEnvelope<T>(T payload, string eventType = "TestEvent") =>
        new(
            EventId: Guid.NewGuid(),
            EventType: eventType,
            SchemaVersion: 1,
            OccurredAt: DateTimeOffset.UtcNow,
            AggregateType: "TestAggregate",
            AggregateId: Guid.NewGuid().ToString(),
            SequenceNumber: 1,
            Payload: payload
        );

    [Fact]
    public async Task PublishThenConsume_ReturnsSameEnvelope()
    {
        // Arrange
        var (publisher, subscriber) = CreateTransportPair();
        var original = MakeEnvelope("hello-bakery");
        DomainEventEnvelope<string>? received = null;
        var received_ = new TaskCompletionSource<DomainEventEnvelope<string>>(
            TaskCreationOptions.RunContinuationsAsynchronously);

        await subscriber.SubscribeAsync<string>(original.EventType,
            (env, _) =>
            {
                received_.TrySetResult(env);
                return Task.CompletedTask;
            });

        // Act
        await publisher.PublishAsync(original);
        received = await received_.Task.WaitAsync(TimeSpan.FromSeconds(5));

        // Assert — all envelope fields must match exactly
        Assert.Equal(original.EventId, received.EventId);
        Assert.Equal(original.EventType, received.EventType);
        Assert.Equal(original.SchemaVersion, received.SchemaVersion);
        Assert.Equal(original.AggregateType, received.AggregateType);
        Assert.Equal(original.AggregateId, received.AggregateId);
        Assert.Equal(original.SequenceNumber, received.SequenceNumber);
        Assert.Equal(original.Payload, received.Payload);
    }

    [Fact]
    public async Task DuplicateEventId_IsDeliveredTwice_ConsumerObservesBoth()
    {
        // Arrange — the transport guarantees at-least-once. A duplicate EventId delivered twice
        // is observable; deduplication is the consumer's job (ADR-0003), not the transport's.
        var (publisher, subscriber) = CreateTransportPair();
        var sharedEventId = Guid.NewGuid();
        var envelope1 = MakeEnvelope("first") with { EventId = sharedEventId };
        var envelope2 = MakeEnvelope("second") with { EventId = sharedEventId };

        var received = new List<DomainEventEnvelope<string>>();
        var countReached = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        await subscriber.SubscribeAsync<string>("TestEvent", (env, _) =>
        {
            lock (received) received.Add(env);
            if (received.Count >= 2) countReached.TrySetResult(true);
            return Task.CompletedTask;
        });

        // Act — publish same EventId twice
        await publisher.PublishAsync(envelope1);
        await publisher.PublishAsync(envelope2);
        await countReached.Task.WaitAsync(TimeSpan.FromSeconds(5));

        // Assert — both arrived; the transport did NOT deduplicate them
        Assert.Equal(2, received.Count);
        Assert.All(received, e => Assert.Equal(sharedEventId, e.EventId));
    }

    [Fact]
    public async Task Subscriber_OnlyReceivesMatchingEventType()
    {
        // Arrange
        var (publisher, subscriber) = CreateTransportPair();
        var orderPlaced = MakeEnvelope("order-data", "OrderPlaced");
        var orderCancelled = MakeEnvelope("cancel-data", "OrderCancelled");

        var receivedByOrderPlacedSub = new List<DomainEventEnvelope<string>>();
        var firstReceived = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        // Subscribe only to OrderPlaced
        await subscriber.SubscribeAsync<string>("OrderPlaced", (env, _) =>
        {
            lock (receivedByOrderPlacedSub) receivedByOrderPlacedSub.Add(env);
            firstReceived.TrySetResult(true);
            return Task.CompletedTask;
        });

        // Act — publish both types
        await publisher.PublishAsync(orderPlaced);
        await publisher.PublishAsync(orderCancelled);

        // Wait for the matching event, then a short delay to ensure the other doesn't arrive
        await firstReceived.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await Task.Delay(100);

        // Assert — only the OrderPlaced event was delivered to this subscriber
        Assert.Single(receivedByOrderPlacedSub);
        Assert.Equal("OrderPlaced", receivedByOrderPlacedSub[0].EventType);
    }
}
