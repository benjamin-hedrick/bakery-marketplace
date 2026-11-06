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

/// <summary>
/// The seam where a real payment authorization will go (<c>PAY-001</c>, ADR-0005: authorize at place, capture at confirm). Only a
/// stub implements it today.
/// </summary>
public interface IPaymentProcessor
{
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

    public Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
    {
        LogPaymentAuthorizationForOrderNoPayment(logger, ProcessorName, request.OrderId, request.AmountCents, request.Currency);
        return Task.FromResult(new PaymentResult(true, $"stub-{request.OrderId}"));
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "{Processor} payment authorization for order {OrderId}, {AmountCents} {Currency}. No payment provider was called and no money moved.")]
    private static partial void LogPaymentAuthorizationForOrderNoPayment(ILogger logger, string processor, string orderId, long amountCents, string currency);
}
