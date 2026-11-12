using Microsoft.Extensions.Options;
using OrderingService.Persistence;

namespace OrderingService.Checkout;

/// <summary>Bound from the <c>OrphanReservations</c> configuration section (register item 62).</summary>
public sealed class OrphanReservationOptions
{
    /// <summary>
    /// A reservation younger than this is never touched: checkout reserves, then saves the order a moment later, and the sweep must not
    /// release stock for an order that is about to exist. It must stay well above the checkout timeout.
    /// </summary>
    public int MinAgeMinutes { get; set; } = 15;

    /// <summary>
    /// How far back the sweep looks. A reservation stays Active for the life of its order, so without a far end every order ever placed would be
    /// checked again on every sweep. An orphan the sweep did not catch within this time is left for an operator.
    /// </summary>
    public int MaxAgeHours { get; set; } = 24;

    public int SweepMinutes { get; set; } = 5;
    public int PageSize { get; set; } = 50;
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// Releases stock reserved for an order that was never saved (register item 62): a crash between reserving and saving leaves a reservation
/// with no order, and its stock would stay taken. The catalog lists its Active reservations in an age window; for each one this looks for the
/// order, and if there is none it releases the reservation through the same idempotent call checkout uses. Several instances may sweep at once:
/// a release is safe to repeat. A catalog or store failure ends the sweep; the next one starts again.
/// </summary>
public sealed partial class OrphanReservationSweeper(
    ICatalogGateway catalog,
    OrderStore orders,
    IPaymentProcessor payments,
    IOptions<OrphanReservationOptions> options,
    ILogger<OrphanReservationSweeper> logger) : BackgroundService
{
    private readonly OrphanReservationOptions _options = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                LogOrphanSweepFailed(logger, e);
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(Math.Max(1, _options.SweepMinutes)), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>One pass over the window. Returns how many reservations were looked at and how many were released.</summary>
    public async Task<(int Checked, int Released)> SweepOnceAsync(CancellationToken ct)
    {
        var older = TimeSpan.FromMinutes(_options.MinAgeMinutes);
        var newer = TimeSpan.FromHours(_options.MaxAgeHours);
        var checkedCount = 0;
        var released = 0;
        string? after = null;
        do
        {
            var page = await catalog.ListActiveReservationsAsync(older, newer, _options.PageSize, after, ct);
            foreach (var reservation in page.Items)
            {
                checkedCount++;
                if (await orders.ExistsAsync(reservation.OrderId, ct)) continue;

                // A checkout that failed after the payment step may have left a payment held (register 171). Void it first, by the order id (idempotent, a no-op
                // when nothing is held); if that cannot be done the reservation stays Active and the next sweep tries again.
                try
                {
                    await payments.VoidAsync(reservation.OrderId, ct);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    LogOrphanPaymentVoidFailed(logger, e, reservation.OrderId);
                    continue;
                }

                await catalog.ReleaseAsync(reservation.OrderId, reservation.VendorId, ct);
                released++;
                LogOrphanReservationReleased(logger, reservation.OrderId, reservation.VendorId, reservation.CreatedAt);
            }
            after = page.NextCursor;
        }
        while (after is not null);
        return (checkedCount, released);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Order {OrderId} has a reservation and no order, and its payment could not be voided; the reservation is kept and the next sweep tries again")]
    private static partial void LogOrphanPaymentVoidFailed(ILogger logger, Exception exception, string orderId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Orphan reservation sweep failed; it will be retried")]
    private static partial void LogOrphanSweepFailed(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Released the stock reserved for order {OrderId} (vendor {VendorId}, reserved {CreatedAt:O}): no such order exists")]
    private static partial void LogOrphanReservationReleased(ILogger logger, string orderId, string vendorId, DateTimeOffset createdAt);
}
