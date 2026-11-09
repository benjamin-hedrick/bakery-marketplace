using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Domain;

namespace CatalogService.Services;

/// <summary>
/// Subscribes catalog-service to the vendor verification events published by admin-service (ADR-0003/0009).
/// Handlers are idempotent and order-safe: <see cref="VendorStatusStore.ApplyAsync"/> ignores duplicates and
/// events older than the last one applied for that vendor.
/// </summary>
public sealed partial class VendorEventSubscriptions : IHostedService
{
    private readonly IEventSubscriber _subscriber;
    private readonly VendorStatusStore _store;
    private readonly ILogger<VendorEventSubscriptions> _logger;

    public VendorEventSubscriptions(
        IEventSubscriber subscriber, VendorStatusStore store, ILogger<VendorEventSubscriptions> logger)
    {
        _subscriber = subscriber;
        _store = store;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await _subscriber.SubscribeAsync<VendorVerifiedPayload>("VendorVerified", async (e, token) =>
        {
            var changed = await _store.ApplyAsync(e.Payload.VendorId, verified: true, e.SequenceNumber, e.OccurredAt, token);
            LogVendorVerified(_logger, e.EventId, e.Payload.VendorId, changed ? "applied" : "ignored (duplicate or stale)");
        }, ct: cancellationToken);

        await _subscriber.SubscribeAsync<VendorSuspendedPayload>("VendorSuspended", async (e, token) =>
        {
            var changed = await _store.ApplyAsync(e.Payload.VendorId, verified: false, e.SequenceNumber, e.OccurredAt, token);
            // The suspension reason is deliberately not logged: it is admin free text and may contain personal data.
            LogVendorSuspended(_logger, e.EventId, e.Payload.VendorId, changed ? "applied" : "ignored (duplicate or stale)");
        }, ct: cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    [LoggerMessage(Level = LogLevel.Information, Message = "VendorVerified {EventId} for {VendorId}: {Result}")]
    private static partial void LogVendorVerified(ILogger logger, Guid eventId, string vendorId, string result);

    [LoggerMessage(Level = LogLevel.Information, Message = "VendorSuspended {EventId} for {VendorId}: {Result}")]
    private static partial void LogVendorSuspended(ILogger logger, Guid eventId, string vendorId, string result);
}
