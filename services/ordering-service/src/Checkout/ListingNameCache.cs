using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace OrderingService.Checkout;

/// <summary>Bound from the <c>ListingNames</c> configuration section (register item 113).</summary>
public sealed class ListingNameOptions
{
    /// <summary>How often the background refresh runs, and how old an entry must be before it refreshes.</summary>
    public int RefreshMinutes { get; set; } = 10;

    /// <summary>An entry older than this is not served (the refresh has been failing for too long): it is fetched again, or shown as ids.</summary>
    public int MaxAgeMinutes { get; set; } = 60;

    /// <summary>An entry nobody has asked for in this long is dropped, so the cache holds only what vendors are looking at.</summary>
    public int RetainHours { get; set; } = 24;

    public int MaxEntries { get; set; } = 2000;

    /// <summary>After a failed fetch of a listing, how long to leave it alone before trying again, so a catalog outage is not hammered.</summary>
    public int FailureBackoffSeconds { get; set; } = 30;

    public bool RefreshEnabled { get; set; } = true;
}

/// <summary>What the vendor view shows for a listing: its name and the names of its modifiers. <see cref="Name"/> is null when the listing is unknown.</summary>
public sealed record ListingNames(string? Name, IReadOnlyDictionary<string, string> Modifiers)
{
    public static readonly ListingNames Unknown = new(null, new Dictionary<string, string>());
}

/// <summary>
/// The names behind the ids in the vendor's order view (register item 113). Order events carry ids because the catalog owns the names; this
/// keeps what the vendor view needs in memory instead of asking the catalog once per order shown. A listing's names are fetched when first
/// needed, kept, and refreshed in the background every <see cref="ListingNameOptions.RefreshMinutes"/>. A miss is not a read per order: every
/// request that needs the same listing while it is being fetched shares that one fetch, however many orders are waiting. If the catalog cannot be
/// reached the vendor still gets the orders, with ids where a name is missing; an entry already held is kept and served until it is too old.
/// </summary>
public sealed class ListingNameCache(
    ICatalogGateway catalog, IOptions<ListingNameOptions> options, TimeProvider time, ILogger<ListingNameCache> logger)
{
    private sealed class Entry(ListingNames names, DateTimeOffset fetchedAt)
    {
        public ListingNames Names { get; } = names;
        public DateTimeOffset FetchedAt { get; } = fetchedAt;
        public long LastUsedTicks;
    }

    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, Lazy<Task<Entry?>>> _inflight = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DateTimeOffset> _failedAt = new(StringComparer.Ordinal);
    private int _fetches;

    /// <summary>How many times the catalog has been asked for a listing. For tests and for noticing a cache that is not working.</summary>
    public int Fetches => Volatile.Read(ref _fetches);

    public int Count => _entries.Count;

    /// <summary>The names of the given listings, fetching only those not held (once each, however many callers want them). Never throws for a catalog failure.</summary>
    public async Task<IReadOnlyDictionary<string, ListingNames>> GetManyAsync(IEnumerable<string> listingIds, CancellationToken ct = default)
    {
        var now = time.GetUtcNow();
        var result = new Dictionary<string, ListingNames>(StringComparer.Ordinal);
        var waiting = new List<(string Id, Task<Entry?> Fetch)>();
        foreach (var id in listingIds.Distinct(StringComparer.Ordinal))
        {
            if (_entries.TryGetValue(id, out var held) && now - held.FetchedAt < MaxAge)
            {
                Touch(held, now);
                result[id] = held.Names;
            }
            else if (!InBackoff(id, now))
            {
                waiting.Add((id, FetchOnce(id)));
            }
        }

        foreach (var (id, fetch) in waiting)
        {
            var entry = await fetch.WaitAsync(ct);
            if (entry is not null)
            {
                Touch(entry, now);
                result[id] = entry.Names;
            }
        }
        return result;
    }

    /// <summary>The background refresh: fetches again every entry older than the refresh interval, and drops those nobody has asked for lately.</summary>
    public async Task<int> RefreshStaleAsync(CancellationToken ct = default)
    {
        var now = time.GetUtcNow();
        var retainTicks = TimeSpan.FromHours(options.Value.RetainHours).Ticks;
        foreach (var (id, entry) in _entries)
        {
            if (now.UtcTicks - Volatile.Read(ref entry.LastUsedTicks) > retainTicks) _entries.TryRemove(id, out _);
        }

        var stale = _entries.Where(kv => now - kv.Value.FetchedAt >= TimeSpan.FromMinutes(options.Value.RefreshMinutes)).Select(kv => kv.Key).ToList();
        foreach (var id in stale) await FetchOnce(id).WaitAsync(ct);
        return stale.Count;
    }

    private TimeSpan MaxAge => TimeSpan.FromMinutes(options.Value.MaxAgeMinutes);

    private bool InBackoff(string id, DateTimeOffset now) =>
        _failedAt.TryGetValue(id, out var failed) && now - failed < TimeSpan.FromSeconds(options.Value.FailureBackoffSeconds);

    private static void Touch(Entry entry, DateTimeOffset now) => Volatile.Write(ref entry.LastUsedTicks, now.UtcTicks);

    private Task<Entry?> FetchOnce(string id) =>
        _inflight.GetOrAdd(id, key => new Lazy<Task<Entry?>>(() => FetchAsync(key), LazyThreadSafetyMode.ExecutionAndPublication)).Value;

    private async Task<Entry?> FetchAsync(string id)
    {
        try
        {
            Interlocked.Increment(ref _fetches);
            var listing = await catalog.GetListingAsync(id);
            var names = listing is null
                ? ListingNames.Unknown // removed, unpublished or never existed: remembered, so it is not asked for again until the next refresh
                : new ListingNames(listing.Name, listing.Modifiers.Where(m => m.Name is not null).ToDictionary(m => m.Id, m => m.Name!, StringComparer.Ordinal));
            var now = time.GetUtcNow();
            var entry = new Entry(names, now);
            Touch(entry, now);
            _entries[id] = entry;
            _failedAt.TryRemove(id, out _);
            EvictIfFull();
            return entry;
        }
        catch (Exception e) when (e is DownstreamUnavailableException or HttpRequestException or TaskCanceledException)
        {
            _failedAt[id] = time.GetUtcNow();
            logger.LogWarning("The catalog could not be asked for the names of listing {ListingId}: {Error}", id, e.GetType().Name);
            return _entries.TryGetValue(id, out var held) && time.GetUtcNow() - held.FetchedAt < MaxAge ? held : null;
        }
        finally
        {
            _inflight.TryRemove(id, out _);
        }
    }

    private void EvictIfFull()
    {
        while (_entries.Count > options.Value.MaxEntries)
        {
            var oldest = _entries.OrderBy(kv => Volatile.Read(ref kv.Value.LastUsedTicks)).FirstOrDefault();
            if (oldest.Key is null || !_entries.TryRemove(oldest.Key, out _)) return;
        }
    }
}

/// <summary>Runs <see cref="ListingNameCache.RefreshStaleAsync"/> on the configured interval (register item 113).</summary>
public sealed class ListingNameRefresher(ListingNameCache cache, IOptions<ListingNameOptions> options, ILogger<ListingNameRefresher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.RefreshEnabled) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromMinutes(Math.Max(1, options.Value.RefreshMinutes)), stoppingToken);
                await cache.RefreshStaleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception e)
            {
                logger.LogWarning(e, "The listing name refresh failed; it will run again");
            }
        }
    }
}
