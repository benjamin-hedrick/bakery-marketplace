using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using Microsoft.Extensions.Logging;
using static OrderingService.Tests.OrderingFactory;
using static OrderingService.Tests.Seed;

namespace OrderingService.Tests;

/// <summary>WI-ORD-010: a payment token is secret-like. It is in no log line, span or tag, whether the checkout succeeds, is refused or lists methods.</summary>
public sealed class PaymentTokenSecrecyTests : IAsyncLifetime
{
    private readonly string _secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(24));
    private readonly Capture _logs = new();
    private FakeCatalogServer _catalog = null!;
    private OrderingFactory _factory = null!;

    public Task InitializeAsync()
    {
        _catalog = new FakeCatalogServer(_secret);
        _factory = new OrderingFactory(_catalog, _secret, logs: _logs);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _catalog.DisposeAsync();
    }

    private static object Body(string method) => new
    {
        vendorId = Vendor,
        paymentMethodId = method,
        lineItems = new[] { new { listingId = "listing-sourdough-001", modifierIds = new[] { "mod-seeds" }, quantity = 2 } },
        pickupWindow = new { start = WindowStart, end = WindowEnd },
    };

    [Fact]
    public async Task NoLogLineOrSpanCarriesAPaymentToken()
    {
        var spans = new ConcurrentQueue<string>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = a => spans.Enqueue(
                a.DisplayName + " " + string.Join(" ", a.TagObjects.Select(t => $"{t.Key}={t.Value}")) + " "
                + string.Join(" ", a.Events.SelectMany(e => e.Tags).Select(t => $"{t.Key}={t.Value}"))),
        };
        ActivitySource.AddActivityListener(listener);
        using var customer = _factory.CustomerClient("customer-1");

        Assert.Equal(HttpStatusCode.Created, (await PostCheckout(customer, Body(ValidMethod))).StatusCode);
        Assert.Equal(HttpStatusCode.PaymentRequired, (await PostCheckout(customer, Body(InvalidMethod))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await customer.GetAsync("/ordering/payment-methods")).StatusCode);

        Assert.Contains(_logs.Lines, l => l.Contains("payment", StringComparison.OrdinalIgnoreCase)); // the capture works: the payment steps logged
        Assert.NotEmpty(spans);
        foreach (var line in _logs.Lines.Concat(spans))
        {
            Assert.DoesNotContain(PaymentMethods.ValidToken, line);
            Assert.DoesNotContain(PaymentMethods.InvalidToken, line);
        }
    }

    private sealed class Capture : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _lines = new();
        public string[] Lines => _lines.ToArray();
        public ILogger CreateLogger(string categoryName) => new Sink(_lines);
        public void Dispose() { }

        private sealed class Sink(ConcurrentQueue<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
                lines.Enqueue(formatter(state, exception) + " " + exception + " " + (state is IEnumerable<KeyValuePair<string, object?>> kv ? string.Join(" ", kv.Select(p => $"{p.Key}={p.Value}")) : ""));
        }
    }
}
