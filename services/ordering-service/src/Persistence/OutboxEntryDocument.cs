using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BakeryMarketplace.EventSchemas;
using Newtonsoft.Json;
using OrderingService.Domain;

namespace OrderingService.Persistence;

/// <summary>
/// An event the order raised but the event backbone has not yet confirmed (WI-ORD-005, open item 68). It is stored inside the order's own
/// document, in the same single-document write that stores the state change, so an order and its pending events can never disagree: there is
/// no moment where the order is saved and its event is lost. The publisher removes the entry once the event is out.
/// </summary>
public sealed class OutboxEntryDocument
{
    [JsonProperty("eventId")] public string EventId { get; set; } = "";
    [JsonProperty("eventType")] public string EventType { get; set; } = "";
    [JsonProperty("sequenceNumber")] public long SequenceNumber { get; set; }
    [JsonProperty("occurredAt")] public DateTimeOffset OccurredAt { get; set; }

    /// <summary>The payload record as JSON. Its type is named by <see cref="EventType"/>.</summary>
    [JsonProperty("payload")] public string PayloadJson { get; set; } = "";

    /// <summary>The W3C trace context of the request that caused the event, so the consumer's span links back to it (ADR-0016).</summary>
    [JsonProperty("traceparent", NullValueHandling = NullValueHandling.Ignore)] public string? Traceparent { get; set; }

    /// <summary>How many times publishing this entry has failed (register item 74). Absent while zero, so existing documents read as zero.</summary>
    [JsonProperty("attempts", DefaultValueHandling = DefaultValueHandling.Ignore)] public int Attempts { get; set; }

    /// <summary>
    /// The same order and sequence number always give the same id, so an event published twice (a crash after publishing but before cleanup)
    /// carries one id and consumers dedupe on it (ADR-0003).
    /// </summary>
    public static string IdFor(string orderId, long sequenceNumber) =>
        new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{orderId}|{sequenceNumber}"))[..16]).ToString();

    public static OutboxEntryDocument From(string orderId, OrderEvent raised, string? traceparent) => new()
    {
        EventId = IdFor(orderId, raised.SequenceNumber),
        EventType = raised.EventType,
        SequenceNumber = raised.SequenceNumber,
        OccurredAt = raised.OccurredAt,
        PayloadJson = System.Text.Json.JsonSerializer.Serialize(raised.Payload, raised.Payload.GetType(), Json),
        Traceparent = traceparent,
    };

    /// <summary>The options the envelope's payload is serialized with everywhere: the same as the Redis transport's.</summary>
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
}
