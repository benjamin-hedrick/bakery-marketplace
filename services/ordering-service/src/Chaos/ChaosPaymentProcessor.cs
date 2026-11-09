using BakeryMarketplace.Chaos;
using OrderingService.Checkout;

namespace OrderingService.Chaos;

/// <summary>
/// The <c>payment</c> layer (ADR-0024): a decorator around the payment processor seam that injects a processor failure (<c>failureRate</c>, an
/// exception, as an unreachable processor would raise), a decline (<c>declineRate</c>, an ordinary "not approved" answer), slowness (<c>latencyMs</c>)
/// and an outage window. Keyed by the order id and the attempt number. It adds no payment rule and reads no token; the wrapped processor is untouched.
/// </summary>
public sealed class ChaosPaymentProcessor(IPaymentProcessor inner, ChaosLayer layer) : IPaymentProcessor
{
    public async Task<PaymentResult> AuthorizeAsync(PaymentRequest request, CancellationToken ct = default)
    {
        await layer.BeforeAsync("authorize", request.OrderId, "failure", "failureRate",
            () => new InvalidOperationException("ChaosPaymentProcessor: simulated processor failure."), ct);

        if (layer.InjectAttempt("authorize", request.OrderId, "decline", "declineRate"))
            return new PaymentResult(false);

        return await inner.AuthorizeAsync(request, ct);
    }
}
