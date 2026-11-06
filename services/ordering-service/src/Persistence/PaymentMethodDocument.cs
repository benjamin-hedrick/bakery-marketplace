using BakeryMarketplace.Data;
using Newtonsoft.Json;

namespace OrderingService.Persistence;

/// <summary>
/// A customer's saved payment method, in the Cosmos <c>payment-methods</c> container partitioned by <c>/customerId</c> (WI-ORD-010). Ordering owns
/// payment, so ordering owns this data. <see cref="Token"/> is an opaque reference (ADR-0005, ADR-0007: no card number, expiry, CVC or brand is ever
/// stored); it is read only by the checkout, **never returned by any API and never logged**. <see cref="Description"/> is free text written by
/// whoever created the method and is what the customer sees; nothing parses it.
/// </summary>
public sealed class PaymentMethodDocument : IETagged
{
    [JsonProperty("id")] public string Id { get; set; } = "";
    [JsonProperty("customerId")] public string CustomerId { get; set; } = "";
    [JsonProperty("description")] public string Description { get; set; } = "";

    /// <summary>The opaque payment token. Secret-like: not in any response, log line, error or trace tag.</summary>
    [JsonProperty("token")] public string Token { get; set; } = "";

    [JsonProperty("createdAt")] public DateTimeOffset CreatedAt { get; set; }
    [JsonProperty("_etag", NullValueHandling = NullValueHandling.Ignore)] public string? ETag { get; set; }
}
