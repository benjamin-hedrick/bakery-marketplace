using BakeryMarketplace.Caching;
using CatalogService.Domain;
using Microsoft.Extensions.Options;

namespace CatalogService.Services;

/// <summary>Bound from the <c>ListingCache</c> configuration section (WI-CAT-003).</summary>
public sealed class ListingCacheOptions
{
    /// <summary>How long a cached entry lives (ADR-0002: 60 seconds). Zero or less turns the cache off: every read goes to the store.</summary>
    public int TtlSeconds { get; set; } = 60;
}

/// <summary>
/// Layer 1 of ADR-0014 for the listing path (WI-CAT-003): cache-aside over the source data that every public listing read shares, the ids of the
/// verified vendors and each vendor's published listing documents. Nothing here is a response body and nothing is per customer: personalization is
/// worked out after the read, so a customer's allergens never reach the cache.
/// <para>
/// The documents hold the exact quantity and low-stock threshold (owner-only fields). They leave the service only through the DTO projection, which
/// strips them; the vendor's own reads (<c>/mine</c>) never use this cache. The <b>cached quantity drifts</b> from the real one, and that is safe
/// because customers see a status and checkout's atomic reservation decides (ADR-0017); a writer invalidates only when a listing's <b>status</b>
/// changes (see <see cref="StockPolicy.StatusOf"/>), not on every sale. With a local (in-process) provider the same instances go to every caller:
/// callers must treat what they get as read only.
/// </para>
/// <para>
/// A cache failure never fails a read and never skips a filter: the load function is the same one a miss uses. A failed invalidation is logged;
/// the entry then lives until its TTL, which is the staleness limit ADR-0002 accepts.
/// </para>
/// </summary>
public sealed partial class ListingCache(ICacheProvider provider, IOptions<ListingCacheOptions> options, ILogger<ListingCache> logger)
{
    public const string VerifiedVendorsKey = "catalog:vendors:verified";

    public static string VendorKey(string vendorId) => $"catalog:listings:vendor:{vendorId}";

    private readonly TimeSpan _ttl = TimeSpan.FromSeconds(options.Value.TtlSeconds);

    public bool Enabled => _ttl > TimeSpan.Zero;

    public async Task<IReadOnlyList<string>> VerifiedVendorIdsAsync(
        Func<CancellationToken, Task<IReadOnlyList<string>>> load, CancellationToken ct = default) =>
        await GetOrLoadAsync(VerifiedVendorsKey, async t => (await load(t)).ToList(), ct);

    public async Task<IReadOnlyList<ListingDocument>> PublishedListingsAsync(
        string vendorId, Func<CancellationToken, Task<IReadOnlyList<ListingDocument>>> load, CancellationToken ct = default) =>
        await GetOrLoadAsync(VendorKey(vendorId), async t => (await load(t)).ToList(), ct);

    public Task InvalidateVendorAsync(string vendorId) => DeleteAsync(VendorKey(vendorId));

    public Task InvalidateVerifiedVendorsAsync() => DeleteAsync(VerifiedVendorsKey);

    private async Task<List<T>> GetOrLoadAsync<T>(string key, Func<CancellationToken, Task<List<T>>> load, CancellationToken ct)
    {
        if (!Enabled) return await load(ct);
        try
        {
            var hit = await provider.GetAsync<List<T>>(key, ct);
            if (hit.Found) return hit.Value!;
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogReadFailed(logger, key, e.GetType().Name);
        }

        var loaded = await load(ct);
        try
        {
            await provider.SetAsync(key, loaded, _ttl, ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogWriteFailed(logger, key, e.GetType().Name);
        }
        return loaded;
    }

    private async Task DeleteAsync(string key)
    {
        if (!Enabled) return;
        try
        {
            await provider.DeleteAsync(key);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogInvalidateFailed(logger, key, e.GetType().Name);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Listing cache read of {Key} failed ({Error}); reading the store instead")]
    private static partial void LogReadFailed(ILogger logger, string key, string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Listing cache write of {Key} failed ({Error}); the next read loads again")]
    private static partial void LogWriteFailed(ILogger logger, string key, string error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Listing cache invalidation of {Key} failed ({Error}); the entry lives until its TTL")]
    private static partial void LogInvalidateFailed(ILogger logger, string key, string error);
}
