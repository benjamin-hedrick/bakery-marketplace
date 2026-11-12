using Microsoft.Extensions.Logging;
using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>The stub honors the processor contract's idempotency on the order id (register 171): a repeat is answered from the first call and holds nothing again.</summary>
public sealed class StubPaymentProcessorTests
{
    private sealed class Lines : ILogger<StubPaymentProcessor>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }

    private static PaymentRequest Request(string orderId) => new(orderId, "customer-1", 900, "USD", "tok");

    [Fact]
    public async Task ARepeatedRequestForTheSameOrderGetsTheFirstAnswerAndIsNotAnotherAuthorization()
    {
        var log = new Lines();
        var stub = new StubPaymentProcessor(log);

        var first = await stub.AuthorizeAsync(Request("order-1"));
        var again = await stub.AuthorizeAsync(Request("order-1"));

        Assert.Equal(first, again);
        Assert.Single(log.Messages, m => m.Contains("payment authorization for order order-1"));
        Assert.Single(log.Messages, m => m.Contains("repeated request for order order-1"));
    }

    [Fact]
    public async Task DifferentOrdersAreAuthorizedSeparately()
    {
        var log = new Lines();
        var stub = new StubPaymentProcessor(log);

        var a = await stub.AuthorizeAsync(Request("order-a"));
        var b = await stub.AuthorizeAsync(Request("order-b"));

        Assert.NotEqual(a.Reference, b.Reference);
        Assert.Equal(2, log.Messages.Count(m => m.Contains("payment authorization for order")));
    }
}
