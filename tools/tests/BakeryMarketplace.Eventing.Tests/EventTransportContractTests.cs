using System.Diagnostics;
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

    // xUnit creates one instance of this class per test, so every test gets event types of its own. The Redis transport
    // names its consumer group after the event type and the transport instance is shared, so tests that reused one type
    // competed for each other's messages (and for backlog left in Redis by earlier runs): open item #35.
    private readonly string _unique = Guid.NewGuid().ToString("N");

    private string TestEventType => $"TestEvent-{_unique}";

    private DomainEventEnvelope<T> MakeEnvelope<T>(T payload, string? eventType = null) =>
        new(
            EventId: Guid.NewGuid(),
            EventType: eventType ?? TestEventType,
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

    private static async Task<DomainEventEnvelope<string>> PublishAndReceive(
        IEventPublisher publisher, IEventSubscriber subscriber, DomainEventEnvelope<string> envelope,
        Action<Activity?>? onHandle = null)
    {
        var received = new TaskCompletionSource<DomainEventEnvelope<string>>(TaskCreationOptions.RunContinuationsAsynchronously);
        await subscriber.SubscribeAsync<string>(envelope.EventType, (env, _) =>
        {
            onHandle?.Invoke(Activity.Current);
            received.TrySetResult(env);
            return Task.CompletedTask;
        });
        await publisher.PublishAsync(envelope);
        return await received.Task.WaitAsync(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Publish_InsideAnActivity_StampsTheEnvelopeWithItsTraceparent()
    {
        var (publisher, subscriber) = CreateTransportPair();
        using var request = new Activity("publisher-request").Start();

        var received = await PublishAndReceive(publisher, subscriber, MakeEnvelope("traced"));

        Assert.Equal(request.Id, received.Traceparent);
        Assert.Matches("^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$", received.Traceparent!);
    }

    [Fact]
    public async Task Publish_WithNoActivity_LeavesTraceparentNull()
    {
        var (publisher, subscriber) = CreateTransportPair();
        Activity.Current = null;

        var received = await PublishAndReceive(publisher, subscriber, MakeEnvelope("untraced"));

        Assert.Null(received.Traceparent);
    }

    [Fact]
    public async Task Publish_KeepsATraceparentTheCallerAlreadySet()
    {
        var (publisher, subscriber) = CreateTransportPair();
        using var request = new Activity("publisher-request").Start();
        const string preset = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";

        var received = await PublishAndReceive(publisher, subscriber, MakeEnvelope("preset") with { Traceparent = preset });

        Assert.Equal(preset, received.Traceparent);
    }

    [Fact]
    public async Task Consume_StartsANewTraceLinkedToThePublisher_NotParentedByIt()
    {
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == EventTracing.ActivitySourceName,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
        };
        ActivitySource.AddActivityListener(listener);
        var (publisher, subscriber) = CreateTransportPair();
        using var request = new Activity("publisher-request").Start();
        Activity? consumer = null;

        await PublishAndReceive(publisher, subscriber, MakeEnvelope("linked"), a => consumer = a);

        Assert.NotNull(consumer);
        Assert.Equal(ActivityKind.Consumer, consumer!.Kind);
        Assert.NotEqual(request.TraceId, consumer.TraceId);
        Assert.Null(consumer.ParentId);
        var link = Assert.Single(consumer.Links);
        Assert.Equal(request.TraceId, link.Context.TraceId);
        Assert.Equal(request.SpanId, link.Context.SpanId);
    }

    [Fact]
    public async Task Consume_IgnoresAMalformedTraceparent()
    {
        var (publisher, subscriber) = CreateTransportPair();

        var received = await PublishAndReceive(publisher, subscriber, MakeEnvelope("bad") with { Traceparent = "not-a-traceparent" });

        Assert.Equal("bad", received.Payload);
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

        await subscriber.SubscribeAsync<string>(TestEventType, (env, _) =>
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
        var orderPlacedType = $"OrderPlaced-{_unique}";
        var orderPlaced = MakeEnvelope("order-data", orderPlacedType);
        var orderCancelled = MakeEnvelope("cancel-data", $"OrderCancelled-{_unique}");

        var receivedByOrderPlacedSub = new List<DomainEventEnvelope<string>>();
        var firstReceived = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

        // Subscribe only to OrderPlaced
        await subscriber.SubscribeAsync<string>(orderPlacedType, (env, _) =>
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
        Assert.Equal(orderPlacedType, receivedByOrderPlacedSub[0].EventType);
    }
}
