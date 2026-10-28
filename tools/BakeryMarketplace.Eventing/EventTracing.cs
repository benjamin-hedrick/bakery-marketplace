using System.Diagnostics;

namespace BakeryMarketplace.Eventing;

/// <summary>
/// W3C trace context for domain events (ADR-0016). Publishers stamp the current trace on the envelope; consumers start
/// a new trace linked to it. The link is deliberate: an event can be handled long after the request that caused it, so
/// the consumer span is not a child of the publisher's trace. See WI-PORT-005.
/// </summary>
public static class EventTracing
{
    public const string ActivitySourceName = "BakeryMarketplace.Eventing";

    private static readonly ActivitySource Source = new(ActivitySourceName);

    /// <summary>Sets <c>Traceparent</c> from the current activity unless the envelope already carries one.</summary>
    public static DomainEventEnvelope<T> StampTraceparent<T>(DomainEventEnvelope<T> envelope)
    {
        if (!string.IsNullOrEmpty(envelope.Traceparent)) return envelope;
        var current = Activity.Current;
        if (current is not { IdFormat: ActivityIdFormat.W3C } || current.Id is null) return envelope;
        return envelope with { Traceparent = current.Id };
    }

    /// <summary>
    /// Starts a consumer activity on a new trace, linked to the envelope's <c>Traceparent</c> when it is valid. Nothing is
    /// started when no one listens to <see cref="ActivitySourceName"/>. A missing or malformed value is ignored, never an error.
    /// Disposing the scope ends the activity and restores the caller's <see cref="Activity.Current"/> (the in-memory
    /// transport runs handlers inline, in the publisher's context).
    /// </summary>
    public static ConsumerScope StartConsumer<T>(DomainEventEnvelope<T> envelope)
    {
        List<ActivityLink>? links = null;
        if (!string.IsNullOrEmpty(envelope.Traceparent)
            && ActivityContext.TryParse(envelope.Traceparent, null, out var publisher))
        {
            links = [new ActivityLink(publisher)];
        }

        // A default parent context falls back to Activity.Current, which would continue the publisher's trace.
        var previous = Activity.Current;
        Activity.Current = null;
        var activity = Source.StartActivity(
            $"process {envelope.EventType}",
            ActivityKind.Consumer,
            parentContext: default,
            tags: [new("messaging.event.id", envelope.EventId.ToString())],
            links: links);
        if (activity is null) Activity.Current = previous;
        return new ConsumerScope(activity, previous);
    }

    public readonly struct ConsumerScope(Activity? activity, Activity? previous) : IDisposable
    {
        public Activity? Activity => activity;

        public void Dispose()
        {
            if (activity is null) return;
            activity.Dispose();
            System.Diagnostics.Activity.Current = previous;
        }
    }
}
