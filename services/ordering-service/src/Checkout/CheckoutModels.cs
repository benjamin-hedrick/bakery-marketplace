using System.Collections.Concurrent;
using BakeryMarketplace.EventSchemas;
using OrderingService.Domain;
using OrderingService.Persistence;

namespace OrderingService.Checkout;

// ---- request (first-slice contract section 4). Everything is nullable so "missing" is distinguishable from zero. ----
// There is deliberately no price, total, customerId or status here: the client never supplies them.
public sealed record CheckoutLineRequest(string? ListingId, List<string>? ModifierIds, int? Quantity);

public sealed record PickupWindowRequest(DateTimeOffset? Start, DateTimeOffset? End);

/// <summary>
/// <c>Allergens</c> (WI-ORD-009) are the registry allergen ids the customer chose to tell the bakery about for this order. Optional; checked against the catalog's
/// registry, never against the customer's profile (which ordering does not read).
/// </summary>
public sealed record CheckoutRequest(
    string? VendorId, List<CheckoutLineRequest>? LineItems, PickupWindowRequest? PickupWindow, List<string>? Allergens = null, string? PaymentMethodId = null);

/// <summary>One thing wrong with a checkout request. <see cref="Field"/> names the input; <see cref="Code"/> is the stable error code.</summary>
public sealed record CheckoutProblem(string Code, string Field, string Message);

public enum CheckoutOutcome
{
    /// <summary>A new order was placed.</summary>
    Created,

    /// <summary>The same checkout was already done; the original order is returned.</summary>
    Existing,

    /// <summary>422: the request is wrong (shape, quantity, modifier).</summary>
    Invalid,

    /// <summary>409: the world changed (listing unavailable, window gone, out of stock).</summary>
    Conflict,

    /// <summary>402: the (stub) payment step declined.</summary>
    PaymentDeclined,

    /// <summary>422: the idempotency key was used before with a different request.</summary>
    KeyReuse,

    /// <summary>503: a dependency could not answer. Nothing was stored.</summary>
    Unavailable,
}

public sealed record CheckoutResult(
    CheckoutOutcome Outcome,
    StoredOrder? Order = null,
    string? Code = null,
    string? Message = null,
    IReadOnlyList<CheckoutProblem>? Problems = null,
    IReadOnlyList<StockLineRejection>? StockRejections = null)
{
    public static CheckoutResult Invalid(IReadOnlyList<CheckoutProblem> problems) =>
        new(CheckoutOutcome.Invalid, Code: problems[0].Code, Message: "The checkout request is invalid.", Problems: problems);
}

// ---- payment step (stub until EPIC-PAYMENTS; ADR-0005) ----

/// <summary>What the payment step is asked to authorize. <see cref="Token"/> is the customer's saved method's opaque token; it is secret-like, so <see cref="ToString"/> leaves it out.</summary>
public sealed record PaymentRequest(string OrderId, string CustomerId, long AmountCents, string Currency, string Token)
{
    public override string ToString() => $"PaymentRequest {{ OrderId = {OrderId}, CustomerId = {CustomerId}, AmountCents = {AmountCents}, Currency = {Currency} }}";
}

public sealed record PaymentResult(bool Approved, string? Reference = null);

/// <summary>The payment processor could not be reached or did not answer in time. The checkout answers "try again" (503 <c>downstream_unavailable</c>), as for an unreachable catalog.</summary>
public sealed class PaymentUnavailableException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// The seam where a real payment authorization will go (<c>PAY-001</c>, ADR-0005: authorize at place, capture at confirm). Only a
/// stub implements it today.
/// </summary>
public interface IPaymentProcessor
{
    /// <summary>
    /// Returns the processor's answer (approved or not). Throws <see cref="PaymentUnavailableException"/> when the processor could not be reached or did not
    /// answer in time (register 170): an implementation converts its own transport failures (connection, timeout, 5xx) to it and nothing else, so a bug stays a bug.
    /// The money may have been held even then, so <b>the call is idempotent on <see cref="PaymentRequest.OrderId"/></b> (register 171): the order id is derived from the
    /// customer and the checkout's idempotency key, so a retry of the same checkout carries the same id, and an implementation answers a repeat with the answer to the
    /// first call and holds nothing a second time. A real processor gets the order id as its idempotency key. Whether a declined answer is also repeated as declined is
    /// the implementation's to say; the checkout never retries a decline.
    /// </summary>
    Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default);
}

/// <summary>
/// **A stub. No money moves.** It approves whatever reaches it and logs a warning each time so it cannot be mistaken for a real integration. It
/// holds no rule about tokens: the checkout refuses an invalid token with <see cref="PaymentTokenValidator"/> before calling any processor
/// (WI-ORD-010; this replaced the decline switch of first-slice contract D-10). It never logs the token.
/// </summary>
public sealed partial class StubPaymentProcessor(ILogger<StubPaymentProcessor> logger) : IPaymentProcessor
{
    public const string ProcessorName = "STUB";

    // Idempotent on the order id, as the contract says a real processor is (register 171): a repeat is answered from the first call and is not an authorization.
    // Kept in memory and bounded: this is a stand-in, and a restart forgets it.
    private const int Remembered = 10_000;
    private readonly ConcurrentDictionary<string, PaymentResult> _authorized = new();

    public Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
    {
        if (_authorized.TryGetValue(request.OrderId, out var first))
        {
            LogStubRepeat(logger, ProcessorName, request.OrderId);
            return Task.FromResult(first);
        }
        if (_authorized.Count >= Remembered) _authorized.Clear();
        var result = _authorized.GetOrAdd(request.OrderId, id => new PaymentResult(true, $"stub-{id}"));
        LogStubAuthorization(logger, ProcessorName, request.OrderId, request.AmountCents, request.Currency);
        return Task.FromResult(result);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Processor} payment authorization for order {OrderId}, {AmountCents} {Currency}. No payment provider was called and no money moved.")]
    private static partial void LogStubAuthorization(ILogger logger, string processor, string orderId, long amountCents, string currency);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Processor} repeated request for order {OrderId} answered from its first authorization; nothing was held again.")]
    private static partial void LogStubRepeat(ILogger logger, string processor, string orderId);
}
