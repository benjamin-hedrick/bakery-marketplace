using BakeryMarketplace.Caching;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Contacts;
using NotificationService.Processing;
using NotificationService.Sending;

namespace NotificationService.Tests;

/// <summary>Shared contract for every <see cref="INotificationSender"/>.</summary>
public abstract class NotificationSenderContractTests
{
    protected abstract INotificationSender Create();

    internal static Notification Message(string address = "x@example.test") =>
        new(Guid.NewGuid(), "order-1", "OrderPlaced", address, "X", "Subject", "Body");

    [Fact]
    public async Task AValidMessageIsAccepted() => Assert.Null(await Record.ExceptionAsync(() => Create().SendAsync(Message())));

    [Fact]
    public async Task AMessageWithoutAnAddressIsRefused() =>
        await Assert.ThrowsAsync<ArgumentException>(() => Create().SendAsync(Message(address: " ")));
}

public sealed class RecordingSenderTests : NotificationSenderContractTests
{
    protected override INotificationSender Create() => new RecordingNotificationSender();
}

public sealed class LogSenderTests : NotificationSenderContractTests
{
    protected override INotificationSender Create() => new LogNotificationSender(NullLogger<LogNotificationSender>.Instance);

    [Fact]
    public async Task TheLogCarriesNeitherTheAddressNorTheText()
    {
        var logger = new CapturingLogger<LogNotificationSender>();

        await new LogNotificationSender(logger).SendAsync(Message("secret.person@example.test"));

        var line = Assert.Single(logger.Lines);
        Assert.Contains("order-1", line);
        Assert.DoesNotContain("secret.person", line);
        Assert.DoesNotContain("Body", line);
    }
}

internal sealed class CapturingLogger<T> : ILogger<T>
{
    public List<string> Lines { get; } = [];
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
        Lines.Add(formatter(state, exception));
}

public sealed class OrderEventNotifierTests
{
    private readonly RecordingNotificationSender _sender = new();
    private readonly CountingDirectory _directory = new(SeededContactDirectoryTests.Seed());
    private readonly CapturingLogger<OrderEventNotifier> _log = new();
    private readonly OrderEventNotifier _notifier;

    public OrderEventNotifierTests()
    {
        var cache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        _notifier = Notifier(_directory, cache);
    }

    private OrderEventNotifier Notifier(IContactDirectory directory, ICacheProvider cache) =>
        new(directory, new TemplateMessageComposer(), _sender, new SentLedger(cache), _log);

    private static DomainEventEnvelope<OrderConfirmedPayload> Confirmed(string orderId, string? customerId) =>
        new(Guid.NewGuid(), "OrderConfirmed", 1, DateTimeOffset.UtcNow, "Order", orderId, 2, new OrderConfirmedPayload(orderId, CustomerId: customerId));

    private static Task<IReadOnlyCollection<Guid>> Handle(OrderEventNotifier notifier, params DomainEventEnvelope<OrderConfirmedPayload>[] events) =>
        notifier.HandleBatchAsync(events, p => p.OrderId, p => p.CustomerId, CancellationToken.None);

    [Fact]
    public async Task ABatchOfEventsReadsTheContactsOnceAndSendsOneMessageEach()
    {
        var failed = await Handle(_notifier, Confirmed("o1", "c1"), Confirmed("o2", "c2"), Confirmed("o3", "c1"));

        Assert.Empty(failed);
        Assert.Equal(3, _sender.Sent.Count);
        var read = Assert.Single(_directory.Calls);
        Assert.Equal(["c1", "c2"], read.OrderBy(x => x));
    }

    [Fact]
    public async Task AnEventDeliveredAgainSendsNothingTheSecondTime()
    {
        var e = Confirmed("o1", "c1");

        await Handle(_notifier, e);
        await Handle(_notifier, e);

        Assert.Single(_sender.Sent);
    }

    [Fact]
    public async Task AFailedSendIsReportedForRetry_TheOthersAreSent_AndTheRetrySucceeds()
    {
        var bad = Confirmed("o-bad", "c1");
        var good = Confirmed("o-good", "c2");
        _sender.FailWhen = n => n.OrderId == "o-bad";

        var failed = await Handle(_notifier, bad, good);

        Assert.Equal([bad.EventId], failed);
        Assert.Equal("o-good", Assert.Single(_sender.Sent).OrderId);

        _sender.FailWhen = null;
        Assert.Empty(await Handle(_notifier, bad, good));
        Assert.Equal(2, _sender.Sent.Count); // the good one was not sent again
    }

    [Fact]
    public async Task ACustomerWithNoContactIsSkippedNotRetried()
    {
        var e = Confirmed("o1", "ghost");

        var failed = await Handle(_notifier, e);

        Assert.Empty(failed);
        Assert.Empty(_sender.Sent);
        Assert.Contains(_log.Lines, l => l.Contains("no contact") && l.Contains("o1"));
    }

    [Fact]
    public async Task AnEventThatNamesNoCustomerIsSkippedNotRetried()
    {
        Assert.Empty(await Handle(_notifier, Confirmed("o1", null)));
        Assert.Empty(_sender.Sent);
        Assert.Empty(_directory.Calls);
    }

    [Fact]
    public async Task AFailedContactReadMakesEveryEventInTheBatchRetry()
    {
        var notifier = Notifier(new ThrowingDirectory(), new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())));
        var a = Confirmed("o1", "c1");
        var b = Confirmed("o2", "c2");

        var failed = await Handle(notifier, a, b);

        Assert.Equal(new[] { a.EventId, b.EventId }.OrderBy(x => x), failed.OrderBy(x => x));
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task TheLogsCarryNoAddress()
    {
        await Handle(_notifier, Confirmed("o1", "c1"), Confirmed("o2", "ghost"));

        Assert.DoesNotContain(_log.Lines, l => l.Contains("example.test") || l.Contains("Customer One"));
    }

    private sealed class ThrowingDirectory : IContactDirectory
    {
        public Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default) =>
            throw new InvalidOperationException("directory down");
    }
}
