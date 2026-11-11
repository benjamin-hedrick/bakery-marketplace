using System.Diagnostics;
using System.Text.Json;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Domain;
using Microsoft.Extensions.Options;

namespace CatalogService.Services;

/// <summary>
/// The catalog's outbox (register item 30, ADR-0003): a change that raises an event stores the event in the listing document in the same
/// write (<see cref="Raise"/>), the request then publishes it inline, and <see cref="ListingOutboxRelay"/> sends whatever the inline path
/// missed. Delivery is at-least-once with a stable event id per listing, version and type, so consumers dedupe on the id. Events of one
/// listing go out in version order and publishing stops at the first failure. An entry that keeps failing is counted and, at
/// <see cref="OutboxOptions.MaxPublishAttempts"/>, the listing's outbox is parked (the rule of ordering's register item 74).
/// </summary>
public sealed partial class ListingEventPublisher(
    IEventPublisher events,
    IRepository<ListingDocument> listings,
    IOptions<OutboxOptions> options,
    TimeProvider time,
    ILogger<ListingEventPublisher> logger)
{
    private const int MaxStoreAttempts = 5;

    /// <summary>Adds the event to the document. Call it after the version is incremented and before the document is saved.</summary>
    public void Raise(ListingDocument doc, string eventType)
    {
        object payload = eventType switch
        {
            ListingEventTypes.Published => new ListingPublishedPayload(doc.Id, doc.VendorId),
            ListingEventTypes.LowStockDetected => new LowStockDetectedPayload(doc.Id, doc.VendorId),
            _ => throw new ArgumentOutOfRangeException(nameof(eventType), eventType, "Unknown listing event type."),
        };
        var traceparent = Activity.Current is { IdFormat: ActivityIdFormat.W3C } activity ? activity.Id : null;
        doc.RaiseEvent(eventType, payload, time.GetUtcNow(), traceparent);
    }

    /// <summary>
    /// Publishes the document's pending events now, so consumers see them within moments. The change is already stored, so a failure or a
    /// slow broker never fails the request or delays it beyond <see cref="OutboxOptions.InlinePublishTimeoutSeconds"/>: the events stay in
    /// the outbox and the relay sends them.
    /// </summary>
    public async Task PublishInlineAsync(ListingDocument stored)
    {
        if (stored.Outbox.Count == 0) return;
        try
        {
            await PublishPendingAsync(stored).WaitAsync(TimeSpan.FromSeconds(options.Value.InlinePublishTimeoutSeconds));
        }
        catch (Exception e)
        {
            LogListingEventsNotPublishedInline(logger, e, stored.Id);
        }
    }

    public async Task<OutboxPublishResult> PublishPendingAsync(ListingDocument stored, CancellationToken ct = default)
    {
        if (stored.ParkedAt is not null || stored.Outbox.Count == 0) return OutboxPublishResult.Nothing;

        var outcome = await OutboxPublishing.PublishInOrderAsync(
            stored.Outbox.OrderBy(e => e.SequenceNumber).ThenBy(e => e.EventType, StringComparer.Ordinal),
            e => e.EventId,
            (entry, token) => SendAsync(entry, stored.Id, token),
            (entry, e) => LogListingEventPublishFailed(logger, e, entry.EventType, entry.SequenceNumber, stored.Id),
            ct);

        if (outcome.PublishedIds.Count > 0) await RemoveAsync(stored, outcome.PublishedIds, ct);
        var parked = outcome is { CountsTowardParking: true, Failed: { } failedEntry } && await RecordFailureAsync(stored, failedEntry, ct);
        return new OutboxPublishResult(outcome.PublishedIds.Count, outcome.Failed is not null, parked);
    }

    /// <summary>Puts a parked listing back to work after the cause is fixed: clears the marker and the attempt counts. For an operator.</summary>
    public async Task<bool> UnparkAsync(string listingId, string vendorId, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt < MaxStoreAttempts; attempt++)
        {
            var doc = await listings.GetAsync(listingId, vendorId, ct);
            if (doc is null) return false;
            if (doc.ParkedAt is null) return true;
            doc.ParkedAt = null;
            doc.SetOutbox(doc.Outbox.Select(e => e.WithAttempts(0)).ToList());
            if (await listings.SaveIfUnchangedAsync(doc, vendorId, ct) is not null) return true;
        }
        return false;
    }

    /// <summary>Listings whose outbox is parked, for an operator or an alert. Looks across every partition: not for request paths.</summary>
    public async Task<IReadOnlyList<ListingDocument>> FindParkedAsync(int take, CancellationToken ct = default)
    {
        var found = new List<ListingDocument>();
        await foreach (var doc in listings.QueryAsync("", q => q.Where(d => d.ParkedAt > 0).Take(take), ct)) found.Add(doc);
        return found;
    }

    /// <summary>Removes the published entries. Re-reads and tries again if the listing changed meanwhile; a repeat publish is deduped by id.</summary>
    private async Task RemoveAsync(ListingDocument stored, IReadOnlyList<string> publishedIds, CancellationToken ct)
    {
        var current = stored;
        for (var attempt = 0; attempt < MaxStoreAttempts; attempt++)
        {
            current.SetOutbox(current.Outbox.Where(e => !publishedIds.Contains(e.EventId)).ToList());
            if (await listings.SaveIfUnchangedAsync(current, current.VendorId, ct) is not null) return;

            var fresh = await listings.GetAsync(stored.Id, stored.VendorId, ct);
            if (fresh is null || !fresh.Outbox.Any(e => publishedIds.Contains(e.EventId))) return; // gone, or already cleaned by someone else
            current = fresh;
        }
        LogListingOutboxCleanupFailed(logger, stored.Id);
    }

    /// <summary>Counts the failed attempt in the stored listing and parks the outbox at the limit. Returns whether it is now parked.</summary>
    private async Task<bool> RecordFailureAsync(ListingDocument stored, ListingOutboxEntry failed, CancellationToken ct)
    {
        try
        {
            var current = stored;
            for (var attempt = 0; attempt < MaxStoreAttempts; attempt++)
            {
                if (current.Outbox.All(e => e.EventId != failed.EventId)) return current.ParkedAt is not null;

                var wasParked = current.ParkedAt is not null;
                current.SetOutbox(current.Outbox.Select(e => e.EventId == failed.EventId ? e.WithAttempts(e.Attempts + 1) : e).ToList());
                if (!wasParked && current.Outbox.Any(e => e.Attempts >= options.Value.MaxPublishAttempts))
                {
                    current.ParkedAt = time.GetUtcNow().ToUnixTimeMilliseconds();
                    current.SetOutbox(current.Outbox.ToList()); // PendingSince leaves the relay's query
                }

                if (await listings.SaveIfUnchangedAsync(current, current.VendorId, ct) is not null)
                {
                    if (current.ParkedAt is not null && !wasParked)
                    {
                        LogListingEventParked(logger, stored.Id, failed.EventType, failed.SequenceNumber, options.Value.MaxPublishAttempts);
                    }
                    return current.ParkedAt is not null;
                }

                var fresh = await listings.GetAsync(stored.Id, stored.VendorId, ct);
                if (fresh is null) return false;
                current = fresh;
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogListingAttemptCountFailed(logger, e, stored.Id);
        }
        return false;
    }

    private Task SendAsync(ListingOutboxEntry entry, string listingId, CancellationToken ct) => entry.EventType switch
    {
        ListingEventTypes.Published => Send<ListingPublishedPayload>(entry, listingId, ct),
        ListingEventTypes.LowStockDetected => Send<LowStockDetectedPayload>(entry, listingId, ct),
        _ => throw new InvalidOperationException($"No payload type is known for event type '{entry.EventType}'."),
    };

    private Task Send<T>(ListingOutboxEntry entry, string listingId, CancellationToken ct)
    {
        var payload = JsonSerializer.Deserialize<T>(entry.PayloadJson, ListingOutboxEntry.Json)
            ?? throw new InvalidOperationException($"The stored payload of {entry.EventType} could not be read.");
        return events.PublishAsync(
            new DomainEventEnvelope<T>(
                Guid.Parse(entry.EventId), entry.EventType, 1, entry.OccurredAt, "Listing", listingId, entry.SequenceNumber, payload, entry.Traceparent),
            ct);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Events of listing {ListingId} were not published inline; the outbox relay will send them")]
    private static partial void LogListingEventsNotPublishedInline(ILogger logger, Exception exception, string listingId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Event {EventType} #{Sequence} of listing {ListingId} could not be published; it stays pending")]
    private static partial void LogListingEventPublishFailed(ILogger logger, Exception exception, string eventType, long sequence, string listingId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Listing {ListingId}: published events could not be removed from the outbox; they will be sent again with the same ids")]
    private static partial void LogListingOutboxCleanupFailed(ILogger logger, string listingId);

    [LoggerMessage(Level = LogLevel.Error, Message = "Listing {ListingId}: event {EventType} #{Sequence} failed {Attempts} times; the listing's outbox is parked and will not be retried until it is unparked")]
    private static partial void LogListingEventParked(ILogger logger, string listingId, string eventType, long sequence, int attempts);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Listing {ListingId}: the failed attempt could not be counted")]
    private static partial void LogListingAttemptCountFailed(ILogger logger, Exception exception, string listingId);
}

/// <summary>
/// The safety net behind the inline publish: periodically finds listings that still have events pending (a crash between saving and
/// publishing, a broker outage) and publishes them. The loop and timing are shared (<see cref="OutboxRelayBase"/>). Several instances may sweep
/// at once; they can send the same event twice, which is harmless because the event id is the same.
/// </summary>
public sealed partial class ListingOutboxRelay(
    IRepository<ListingDocument> listings,
    ListingEventPublisher publisher,
    IOptions<OutboxOptions> options,
    TimeProvider time,
    ILogger<ListingOutboxRelay> logger) : OutboxRelayBase(options.Value, null, logger, "Catalog")
{
    public override async Task<(int Found, int Published)> SweepOnceAsync(CancellationToken ct)
    {
        var cutoff = time.GetUtcNow().AddSeconds(-Options.GraceSeconds).ToUnixTimeMilliseconds();
        var pending = new List<ListingDocument>();
        await foreach (var doc in listings.QueryAsync("", q => q.Where(d => d.PendingSince <= cutoff).Take(Options.BatchSize), ct)) pending.Add(doc);

        var published = 0;
        foreach (var doc in pending) published += (await publisher.PublishPendingAsync(doc, ct)).Published;

        if (pending.Count > 0)
        {
            // These are events the inline path did not deliver, so this line is the signal that a miss happened.
            LogCatalogRelayPublished(Logger, pending.Count, published);
        }
        return (pending.Count, published);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Catalog outbox relay: {Listings} listing(s) had unpublished events; {Published} event(s) published")]
    private static partial void LogCatalogRelayPublished(ILogger logger, int listings, int published);
}
