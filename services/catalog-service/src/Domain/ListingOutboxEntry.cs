using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace CatalogService.Domain;

public static class ListingEventTypes
{
    public const string Published = "ListingPublished";
    public const string LowStockDetected = "LowStockDetected";
}

/// <summary>
/// An event raised by a change to a listing and not yet confirmed published (register item 30, ADR-0003). It is stored in the listing
/// document, in the same write as the change, so the change and its event can never disagree. The publisher removes it once the event is out.
/// </summary>
public sealed class ListingOutboxEntry
{
    [JsonProperty("eventId")] public string EventId { get; set; } = "";
    [JsonProperty("eventType")] public string EventType { get; set; } = "";

    /// <summary>The listing's <see cref="ListingDocument.Version"/> at the change: the event's sequence number.</summary>
    [JsonProperty("sequenceNumber")] public long SequenceNumber { get; set; }
    [JsonProperty("occurredAt")] public DateTimeOffset OccurredAt { get; set; }
    [JsonProperty("payload")] public string PayloadJson { get; set; } = "";
    [JsonProperty("traceparent", NullValueHandling = NullValueHandling.Ignore)] public string? Traceparent { get; set; }

    /// <summary>How many times publishing this entry has failed (register item 74's rule, applied to the catalog). Absent while zero.</summary>
    [JsonProperty("attempts", DefaultValueHandling = DefaultValueHandling.Ignore)] public int Attempts { get; set; }

    /// <summary>The same listing, version and type always give the same id, so an event published twice carries one id and consumers dedupe on it.</summary>
    public static string IdFor(string listingId, long version, string eventType) =>
        new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{listingId}|{version}|{eventType}"))[..16]).ToString();

    /// <summary>The options event payloads are serialized with, the same as the Redis transport's.</summary>
    public static readonly System.Text.Json.JsonSerializerOptions Json = new(System.Text.Json.JsonSerializerDefaults.Web);

    public ListingOutboxEntry WithAttempts(int attempts) => new()
    {
        EventId = EventId,
        EventType = EventType,
        SequenceNumber = SequenceNumber,
        OccurredAt = OccurredAt,
        PayloadJson = PayloadJson,
        Traceparent = Traceparent,
        Attempts = attempts,
    };
}
