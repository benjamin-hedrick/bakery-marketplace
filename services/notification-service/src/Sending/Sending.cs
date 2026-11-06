using System.Collections.Concurrent;

namespace NotificationService.Sending;

/// <summary>One message to one recipient. Carries personal data (address, name): only a sender may read it, and none logs it.</summary>
public sealed record Notification(Guid EventId, string OrderId, string EventType, string ToAddress, string ToName, string Subject, string Body);

/// <summary>
/// Delivers a message. The real providers (email, SMS, push) are not built; implementations here are a recording fake for tests and a
/// sender that only logs that a message was sent. Throwing means "not delivered, try again later".
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

    public IReadOnlyCollection<Notification> Sent => _sent.ToArray();

    /// <summary>When set and it returns true for a message, the send throws instead of recording.</summary>
    public Func<Notification, bool>? FailWhen { get; set; }

    public Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        NotificationChecks.Validate(notification);
        if (FailWhen?.Invoke(notification) == true) throw new InvalidOperationException("The recording sender was told to fail.");
        _sent.Enqueue(notification);
        return Task.CompletedTask;
    }
}

/// <summary>Local sender: writes that a message was produced (order, event and type only), never the address, name or text.</summary>
public sealed partial class LogNotificationSender(ILogger<LogNotificationSender> logger) : INotificationSender
{
    public Task SendAsync(Notification notification, CancellationToken ct = default)
    {
        NotificationChecks.Validate(notification);
        LogNotificationForOrderEventProducedNot(logger, notification.OrderId, notification.EventType, notification.EventId);
        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Notification for order {OrderId} ({EventType}, event {EventId}) produced; not delivered to a provider")]
    private static partial void LogNotificationForOrderEventProducedNot(ILogger logger, string orderId, string eventType, System.Guid eventId);
}
