using System.Net;
using Microsoft.Azure.Cosmos;

namespace BakeryMarketplace.Data;

/// <summary>
/// The store could not be reached or did not answer in time (register 170): a Cosmos 503, 408 or 429, the transport-class failures a caller may retry.
/// An adapter throws it instead of its own SDK exception, so a service can answer "try again" without knowing which store it runs on. It is thrown
/// only for these; a bug, a bad request or a conflict stays what it was. For a write the outcome is unknown (it may have been made): the caller's
/// idempotency decides whether a retry is safe.
/// </summary>
public sealed class StoreUnavailableException(string message, HttpStatusCode status, Exception? inner = null) : Exception(message, inner)
{
    /// <summary>The status the store gave (503, 408 or 429), for a log or a test; never shown to a customer.</summary>
    public HttpStatusCode StatusCode { get; } = status;

    /// <summary>True for the status codes that mean "could not reach it, or it did not answer in time" and nothing else.</summary>
    public static bool IsTransport(HttpStatusCode status) =>
        status is HttpStatusCode.ServiceUnavailable or HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests;

    /// <summary>
    /// True for what a store that cannot be reached looks like to the SDK's caller: a Cosmos 503, 408 or 429, or the <see cref="HttpRequestException"/> the SDK
    /// lets through when it cannot even connect (found by running the SDK against a closed port: no CosmosException is made then). Nothing else: not a
    /// cancellation by the caller, not a bug, not a conflict.
    /// </summary>
    public static bool IsTransportFailure(Exception e) =>
        e is CosmosException c ? IsTransport(c.StatusCode) : e is HttpRequestException;

    internal static StoreUnavailableException From(Exception e) => e is CosmosException c
        ? new($"The store could not be reached or did not answer in time (HTTP {(int)c.StatusCode}).", c.StatusCode, c)
        : new("The store could not be reached.", HttpStatusCode.ServiceUnavailable, e);
}
