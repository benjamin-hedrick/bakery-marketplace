using System.Collections.Concurrent;
using BakeryMarketplace.Caching;
using CatalogService.Domain;
using Microsoft.Extensions.Options;

namespace CatalogService.Services;

/// <summary>Bound from the <c>ListingCache</c> configuration section (WI-CAT-003).</summary>
public sealed class ListingCacheOptions
{
    /// <summary>How long a cached entry lives (ADR-0002: 60 seconds). Zero or less turns the cache off: every read goes to the store.</summary>
    public int TtlSeconds { get; set; } = 60;

    /// <summary>
    /// How long one shared load of a key may take before it is given up (the callers waiting on it then see a timeout). The load belongs to every caller
    /// waiting for it, so it does not run under any one caller's cancellation.
    /// </summary>
    public int LoadTimeoutSeconds { get; set; } = 30;
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
/// <para>
/// <b>Stampede protection (single flight).</b> When an entry is missing (a cold start, an expiry, or an invalidation), every request that arrives while
/// it is being loaded would otherwise load it too: a burst of identical store reads at the moment the store is least able to take them. Here the first
/// miss for a key starts the one load and the others wait for its result. The load belongs to all of them, so it does not run under any one caller's
/// cancellation (a caller that cancels stops waiting, nothing more) and it has its own timeout (<see cref="ListingCacheOptions.LoadTimeoutSeconds"/>); if it
/// fails, the callers waiting on it see the failure and the next call tries again, nothing failed is kept. This is per process: replicas each load once.
/// </para>
/// <para>
/// <b>Invalidation and a load that is under way.</b> An invalidation bumps the key's generation and drops the load in flight: a request after it starts a
/// new load rather than joining one that began before the write, and a load that began before the write does not put its (possibly old) result in the
/// cache when it finishes. The callers that were already waiting on it still get what it read.
/// </para>
/// </summary>
public sealed partial class ListingCache(ICacheProvider provider, IOptions<ListingCacheOptions> options, ILogger<ListingCache> logger)
{
    public const string VerifiedVendorsKey = "catalog:vendors:verified";

    public static string VendorKey(string vendorId) => $"catalog:listings:vendor:{vendorId}";

    private readonly TimeSpan _ttl = TimeSpan.FromSeconds(options.Value.TtlSeconds);
    private readonly TimeSpan _loadTimeout = TimeSpan.FromSeconds(Math.Max(1, options.Value.LoadTimeoutSeconds));
    private readonly ConcurrentDictionary<string, Lazy<Task<object>>> _inFlight = new();
    private readonly ConcurrentDictionary<string, long> _generation = new();
    private long _loads;
    private long _coalesced;

    public bool Enabled => _ttl > TimeSpan.Zero;

    /// <summary>How many shared loads this cache has started (one per miss that was not already being loaded; one that finds the entry already filled does not read the store).</summary>
    public long Loads => Interlocked.Read(ref _loads);

    /// <summary>How many requests did not load because they joined a load already under way: the reads the single flight saved.</summary>
    public long Coalesced => Interlocked.Read(ref _coalesced);

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

        // A miss: one load per key at a time. Whoever creates the entry loads; the others wait for it.
        Lazy<Task<object>>? mine = null;
        mine = new Lazy<Task<object>>(() => LoadAndStoreAsync(key, load, mine!), LazyThreadSafetyMode.ExecutionAndPublication);
        var flight = _inFlight.GetOrAdd(key, mine);
        if (ReferenceEquals(flight, mine)) Interlocked.Increment(ref _loads);
        else Interlocked.Increment(ref _coalesced);

        // This caller may stop waiting; the load carries on for the others.
        return (List<T>)await flight.Value.WaitAsync(ct);
    }

    private async Task<object> LoadAndStoreAsync<T>(string key, Func<CancellationToken, Task<List<T>>> load, Lazy<Task<object>> self)
    {
        var generation = GenerationOf(key);
        try
        {
            // Look again before reading the store: the load that was under way when this caller missed may have finished in the meantime, and this
            // caller must not start a second one for an entry that is already there.
            try
            {
                var again = await provider.GetAsync<List<T>>(key);
                if (again.Found) return again.Value!;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                LogReadFailed(logger, key, e.GetType().Name);
            }

            using var timeout = new CancellationTokenSource(_loadTimeout);
            var loaded = await load(timeout.Token);
            // Only a load that began after the last invalidation may fill the cache: one that began before a write could be holding the old data.
            if (GenerationOf(key) == generation)
            {
                try
                {
                    await provider.SetAsync(key, loaded, _ttl);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    LogWriteFailed(logger, key, e.GetType().Name);
                }
            }
            return loaded;
        }
        finally
        {
            _inFlight.TryRemove(new KeyValuePair<string, Lazy<Task<object>>>(key, self)); // a failed load is not kept: the next call tries again
        }
    }

    private long GenerationOf(string key) => _generation.GetValueOrDefault(key);

    private async Task DeleteAsync(string key)
    {
        if (!Enabled) return;
        _generation.AddOrUpdate(key, 1, (_, g) => g + 1); // first: a load that began before this write must not fill the cache after it
        _inFlight.TryRemove(key, out _); // and a request after the write must not join a load that began before it
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
