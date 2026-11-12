using BakeryMarketplace.Chaos;
using NotificationService.Chaos;
using NotificationService.Sending;

namespace NotificationService.Tests;

/// <summary>With every setting off the chaos sender is invisible: the shared sender contract passes through it (WI-CHAOS-002).</summary>
public sealed class ChaosSenderContractTests : NotificationSenderContractTests
{
    private readonly RecordingNotificationSender _inner = new();

    protected override INotificationSender Create() =>
        new ChaosNotificationSender(_inner, ChaosRuntime.ForTests(ChaosScenario.Of("off", 1, "notification")).Layer("notification"));

    protected override int Delivered(INotificationSender sender, Notification message) => _inner.Sent.Count(n => n.EventId == message.EventId);
}

/// <summary>The notification layer: a delivery that fails (the sender contract says a throw means "not delivered, try again later"), slowness, an outage.</summary>
public sealed class ChaosSenderTests
{
    private static (ChaosNotificationSender Sender, RecordingNotificationSender Inner, ChaosRuntime Runtime) Build(long seed, params (string Setting, double Value)[] settings)
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("notification-test", seed, "notification", settings));
        var inner = new RecordingNotificationSender();
        return (new ChaosNotificationSender(inner, runtime.Layer("notification")), inner, runtime);
    }

    private static Notification Message(Guid? id = null) =>
        new(id ?? Guid.NewGuid(), "order-1", "OrderPlaced", "someone@example.test", "Someone", "Subject", "Body");

    [Fact]
    public async Task FailureRateOfOne_FailsEverySend_AndNothingIsDelivered()
    {
        var (sender, inner, runtime) = Build(1, ("failureRate", 1));

        await Assert.ThrowsAsync<InvalidOperationException>(() => sender.SendAsync(Message()));

        Assert.Equal(1, runtime.Journal.Count("notification", "failure"));
        Assert.Empty(inner.Sent);
    }

    [Fact]
    public async Task APersonsAddressAndNameNeverReachTheJournal()
    {
        var (sender, _, runtime) = Build(1, ("failureRate", 1), ("latencyMs", 1));

        await Assert.ThrowsAsync<InvalidOperationException>(() => sender.SendAsync(Message()));

        Assert.DoesNotContain(runtime.Journal.Entries, e => e.Key.Contains("example.test") || e.Key.Contains("Someone"));
    }

    [Fact]
    public async Task WithHalfTheSendsFailing_RetriesDeliverEveryMessageExactlyOnce()
    {
        var (sender, inner, runtime) = Build(5, ("failureRate", 0.5));
        var ids = Enumerable.Range(0, 20).Select(_ => Guid.NewGuid()).ToList();

        foreach (var id in ids)
        {
            for (var attempt = 0; attempt < 50; attempt++) // "try again later": a retry is judged afresh
            {
                try { await sender.SendAsync(Message(id)); break; }
                catch (InvalidOperationException) { }
            }
        }

        Assert.True(runtime.Journal.Count("notification", "failure") > 0, "chaos must actually have failed some sends");
        Assert.Equal(ids.Order(), inner.Sent.Select(n => n.EventId).Order()); // each delivered, none twice
    }

    [Fact]
    public async Task ALostResponse_MeansTheMessageWasSent_AndTheRetryDoesNotSendItAgain_BecauseTheEventIdIsTheIdempotencyKey()
    {
        var (sender, inner, runtime) = Build(1, ("lostResponseRate", 1));
        var id = Guid.NewGuid();

        await Assert.ThrowsAsync<TimeoutException>(() => sender.SendAsync(Message(id)));
        await Assert.ThrowsAsync<TimeoutException>(() => sender.SendAsync(Message(id))); // "try again later"

        Assert.Equal(2, runtime.Journal.Count("notification", "lostResponse"));
        // Sent once for one event: the sender contract makes the event id the idempotency key (register 171), and the wrapped sender honors it.
        Assert.Equal(1, inner.Sent.Count(n => n.EventId == id));
    }

    [Fact]
    public async Task AnOutageWindowFailsSends_ThenRecovers()
    {
        var (sender, inner, runtime) = Build(1, ("outageWindowSeconds", 0.2));

        await Assert.ThrowsAsync<InvalidOperationException>(() => sender.SendAsync(Message()));
        await Task.Delay(300);
        await sender.SendAsync(Message());

        Assert.Equal(1, runtime.Journal.Count("notification", "outage"));
        Assert.Single(inner.Sent);
    }

    [Fact]
    public async Task LatencyDelaysTheSend()
    {
        var (sender, inner, runtime) = Build(1, ("latencyMs", 150));
        var started = DateTime.UtcNow;

        await sender.SendAsync(Message());

        Assert.Equal(1, runtime.Journal.Count("notification", "latency"));
        Assert.True(DateTime.UtcNow - started >= TimeSpan.FromMilliseconds(120));
        Assert.Single(inner.Sent);
    }
}
