using System.Collections.Concurrent;

namespace NotificationService.Sending;

/// <summary>One message to one recipient. Carries personal data (address, name): only a sender may read it, and none logs it.</summary>
public sealed record Notification(Guid EventId, string OrderId, string EventType, string ToAddress, string ToName, string Subject, string Body);

/// <summary>
/// Delivers a message. The real providers (email, SMS, push) are not built; implementations here are a recording fake for tests and a
/// sender that only logs that a message was sent. Throwing means "not delivered, try again later".
/// <para>
/// <b>Idempotent on <see cref="Notification.EventId"/></b> (register 171): "try again later" after a lost answer sends the same event again, so an implementation
/// treats the event id as the provider's idempotency key and sends a message for one event once, however often it is asked. A real provider that cannot take a
/// key leaves a small window in which a lost answer repeats a message; a repeated status message is accepted over a missing one.
/// </para>
/// </summary>
public interface INotificationSender
{
    Task SendAsync(Notification notification, CancellationToken ct = default);
}

internal static class NotificationChecks
{
    public static void Validate(Notification n)
    {
        ArgumentNullException.ThrowIfNull(n);
        if (string.IsNullOrWhiteSpace(n.ToAddress)) throw new ArgumentException("A notification needs an address.", nameof(n));
        if (string.IsNullOrWhiteSpace(n.Subject)) throw new ArgumentException("A notification needs a subject.", nameof(n));
    }
}

/// <summary>Keeps what it was asked to send, for tests. Can be made to fail, to prove a failed send is retried.</summary>
public sealed class RecordingNotificationSender : INotificationSender
{
    private readonly ConcurrentQueue<Notification> _sent = new();
    private readonly ConcurrentDictionary<Guid, byte> _seen = new();

    public IReadOnlyCollection<Notification> Sent => _sent.ToArray();

    /// <summary>When set and it returns true for a message, the send throws instead of recording.</summary>
    public Func<Notification, bool>? FailWhen { get; set; }

    public Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        NotificationChecks.Validate(notification);
        if (FailWhen?.Invoke(notification) == true) throw new InvalidOperationException("The recording sender was told to fail.");
        if (!_seen.TryAdd(notification.EventId, 0)) return Task.CompletedTask; // idempotent on the event id, as the contract says
        _sent.Enqueue(notification);
        return Task.CompletedTask;
    }
}

/// <summary>Local sender: writes that a message was produced (order, event and type only), never the address, name or text.</summary>
public sealed partial class LogNotificationSender(ILogger<LogNotificationSender> logger) : INotificationSender
{
    // Idempotent on the event id, as a provider that takes an idempotency key is: a repeat is recognised and nothing is produced. Bounded, in memory: a stand-in.
    private const int Remembered = 10_000;
    private readonly ConcurrentDictionary<Guid, byte> _seen = new();

    public Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        NotificationChecks.Validate(notification);
        if (_seen.Count >= Remembered) _seen.Clear();
        if (_seen.TryAdd(notification.EventId, 0)) LogNotificationProduced(logger, notification.OrderId, notification.EventType, notification.EventId);
        else LogNotificationRepeat(logger, notification.OrderId, notification.EventType, notification.EventId);
        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Notification for order {OrderId} ({EventType}, event {EventId}) was asked for again; the event id is the idempotency key, so nothing more was produced")]
    private static partial void LogNotificationRepeat(ILogger logger, string orderId, string eventType, Guid eventId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Notification for order {OrderId} ({EventType}, event {EventId}) produced; not delivered to a provider")]
    private static partial void LogNotificationProduced(ILogger logger, string orderId, string eventType, Guid eventId);
}
