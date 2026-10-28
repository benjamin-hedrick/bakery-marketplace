using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Domain;

namespace CatalogService.Services;

/// <summary>
/// Publishes stock events after the stock change is already stored. There is no outbox yet (open item 30), so a publish failure is
/// logged rather than failing the request that already succeeded.
/// </summary>
public sealed class StockEventPublisher(IEventPublisher events, TimeProvider time, ILogger<StockEventPublisher> logger)
{
    /// <summary>Published once when a limited item crosses into low (or sold out), not on every change while it stays there.</summary>
    public async Task LowStockAsync(ListingDocument doc, CancellationToken ct)
    {
        try
        {
            await events.PublishAsync(new DomainEventEnvelope<LowStockDetectedPayload>(
                Guid.NewGuid(), "LowStockDetected", 1, time.GetUtcNow(), "Listing", doc.Id, doc.Version,
                new LowStockDetectedPayload(doc.Id, doc.VendorId)), ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "LowStockDetected event could not be published for a persisted listing ({ListingId})", doc.Id);
        }
    }
}
