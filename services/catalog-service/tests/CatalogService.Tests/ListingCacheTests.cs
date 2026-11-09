using System.Text.Json;
using BakeryMarketplace.Caching;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
using CatalogService.Tags;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace CatalogService.Tests;

/// <summary>
/// WI-CAT-003 (ADR-0002, ADR-0014 layer 1): the cache-aside over the verified vendor ids and each vendor's published listings. The store reads are
/// counted, so "warm" means no store read; "invalidated" means the next read goes to the store and shows the new state.
/// </summary>
public sealed class ListingCacheTests
{
    private const string Vendor = "vendor-1";
    private const string OtherVendor = "vendor-2";

    private sealed class ManualTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    /// <summary>Counts how many times a partition's listings are queried: the reads a cache is there to save.</summary>
    private sealed class CountingRepository<T>(IRepository<T> inner) : IRepository<T> where T : class
    {
        private int _queries;

        public int Queries => Volatile.Read(ref _queries);

        /// <summary>
        /// Called with the number of the query (1, 2, ...) after it has read the store and before it answers: a test holds a load open here (so what it
        /// read is older than anything written meanwhile), or fails it.
        /// </summary>
        public Func<int, Task>? AfterRead { get; set; }

        public Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default) => inner.GetAsync(id, partitionKey, ct);
        public Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default) => inner.SaveAsync(entity, partitionKey, ct);
        public Task<T?> SaveIfUnchangedAsync(T entity, string partitionKey, CancellationToken ct = default) => inner.SaveIfUnchangedAsync(entity, partitionKey, ct);
        public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default) => inner.DeleteAsync(id, partitionKey, ct);

        public IAsyncEnumerable<T> QueryAsync(string partitionKey, Func<IQueryable<T>, IQueryable<T>> query, CancellationToken ct = default) =>
            Answer(Interlocked.Increment(ref _queries), partitionKey, query, ct);

        private async IAsyncEnumerable<T> Answer(
            int number, string partitionKey, Func<IQueryable<T>, IQueryable<T>> query, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
        {
            var items = new List<T>();
            await foreach (var item in inner.QueryAsync(partitionKey, query, ct)) items.Add(item);
            if (AfterRead is not null) await AfterRead(number);
            foreach (var item in items) yield return item;
        }
    }

    private sealed class ThrowingCache : ICacheProvider
    {
        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default) => throw new InvalidOperationException("cache down");
        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default) => throw new InvalidOperationException("cache down");
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) => throw new InvalidOperationException("cache down");
        public Task DeleteAsync(string key, CancellationToken ct = default) => throw new InvalidOperationException("cache down");
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => throw new InvalidOperationException("cache down");
    }

    private sealed class Rig
    {
        public CountingRepository<ListingDocument> Listings { get; }
        public ListingService Service { get; }
        public ListingService Uncached { get; }
        public StockReservationService Reservation { get; }
        public VendorStatusStore Vendors { get; }
        public ListingCache Cache { get; }

        private readonly FakeRepository<VendorStatusDocument> _status = new(d => d.Id);

        private Rig(ICacheProvider provider, int ttlSeconds)
        {
            var database = new FakeDatabase();
            Listings = new CountingRepository<ListingDocument>(new FakeRepository<ListingDocument>(d => d.Id, database));
            var reservations = new FakeRepository<StockReservationDocument>(d => d.Id, database);
            var time = new ManualTime(new DateTimeOffset(2026, 11, 7, 12, 0, 0, TimeSpan.Zero));
            Cache = new ListingCache(provider, Options.Create(new ListingCacheOptions { TtlSeconds = ttlSeconds }), NullLogger<ListingCache>.Instance);
            Vendors = new VendorStatusStore(_status, Cache);
            var publisher = new ListingEventPublisher(
                new InMemoryEventTransport(), Listings, Options.Create(new OutboxOptions()), time, NullLogger<ListingEventPublisher>.Instance);
            Service = new ListingService(Listings, Vendors, publisher, time, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, Cache);
            Uncached = new ListingService(Listings, new VendorStatusStore(_status), publisher, time, NullLogger<ListingService>.Instance, TestServices.Tags, TestServices.TagLimits, TestServices.CacheOff());
            Reservation = new StockReservationService(Listings, reservations, new FakeBatchFactory(database), Vendors, publisher, time, Cache);
        }

        public static async Task<Rig> CreateAsync(ICacheProvider? provider = null, int ttlSeconds = 60)
        {
            var rig = new Rig(provider ?? new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions())), ttlSeconds);
            await rig.Vendors.ApplyAsync(Vendor, verified: true, sequence: 1, DateTimeOffset.UnixEpoch);
            return rig;
        }

        public static ListingRequest Request(string name = "Sourdough", string status = "Published", int? quantity = null, int priceCents = 800, int? threshold = null) =>
            new(name, null, "bread", priceCents, null, null, status, quantity is null && threshold is null ? null : new StockRequest(quantity, null, threshold));

        public async Task<ListingDocument> CreateListingAsync(string name = "Sourdough", int? quantity = null, string status = "Published", string vendor = Vendor)
        {
            var result = await Service.CreateAsync(vendor, Request(name, status, quantity));
            Assert.Equal(ListingOutcome.Created, result.Outcome);
            return result.Listing!;
        }

        public async Task<IReadOnlyList<ListingDocument>> BrowseAsync(ListingService? service = null) =>
            (await (service ?? Service).BrowseAsync(100, null)).Items;
    }

    private static string StatusOf(ListingDocument d) => StockPolicy.StatusOf(d);

    // ---- cache-aside -------------------------------------------------------------------------

    [Fact]
    public async Task AColdBrowsePopulatesTheCacheAndAWarmOneReadsNoStore()
    {
        var rig = await Rig.CreateAsync();
        await rig.CreateListingAsync();

        var cold = await rig.BrowseAsync();
        var queriesAfterCold = rig.Listings.Queries;
        var warm = await rig.BrowseAsync();

        Assert.Equal(1, queriesAfterCold); // one vendor, one partition read
        Assert.Equal(queriesAfterCold, rig.Listings.Queries);
        Assert.Equal(cold.Select(l => l.Id), warm.Select(l => l.Id));
    }

    [Fact]
    public async Task ADetailReadUsesTheSameCacheAsBrowse()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync();
        await rig.BrowseAsync();
        var queries = rig.Listings.Queries;

        var found = await rig.Service.GetPublicAsync(created.Id);

        Assert.Equal(created.Id, found!.Id);
        Assert.Equal(queries, rig.Listings.Queries);
    }

    [Fact]
    public async Task WithTheCacheOffEveryReadGoesToTheStore()
    {
        var rig = await Rig.CreateAsync(ttlSeconds: 0);
        await rig.CreateListingAsync();

        await rig.BrowseAsync();
        await rig.BrowseAsync();

        Assert.Equal(2, rig.Listings.Queries);
    }

    [Fact]
    public async Task TheCachedAndTheUncachedServiceGiveTheSamePagesAndCursors()
    {
        var rig = await Rig.CreateAsync();
        await rig.Vendors.ApplyAsync(OtherVendor, verified: true, sequence: 1, DateTimeOffset.UnixEpoch);
        for (var i = 0; i < 7; i++) await rig.CreateListingAsync($"Loaf {i}", quantity: 10 + i, vendor: i % 2 == 0 ? Vendor : OtherVendor);
        await rig.CreateListingAsync("Draft loaf", status: "Draft");

        foreach (var limit in new[] { 1, 3, 100 })
        {
            string? after = null;
            string? afterUncached = null;
            for (var page = 0; page < 10; page++)
            {
                var cached = await rig.Service.BrowseAsync(limit, after);
                var uncached = await rig.Uncached.BrowseAsync(limit, afterUncached);
                Assert.Equal(uncached.Items.Select(l => l.Id), cached.Items.Select(l => l.Id));
                Assert.Equal(uncached.NextCursor, cached.NextCursor);
                after = cached.NextCursor;
                afterUncached = uncached.NextCursor;
                if (after is null) break;
            }
        }

        Assert.DoesNotContain(await rig.BrowseAsync(), l => l.Name == "Draft loaf");
    }

    // ---- stock: invalidate on a change of status, not on every sale ---------------------------

    [Fact]
    public async Task ASaleThatKeepsTheStatusDoesNotInvalidateAndTheCachedQuantityDrifts()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(quantity: 500);
        await rig.BrowseAsync();
        var queries = rig.Listings.Queries;

        var reserved = await rig.Reservation.ReserveAsync("order-1", Vendor, [(created.Id, 1)]);
        var after = await rig.BrowseAsync();

        Assert.Equal(ReservationOutcome.Reserved, reserved.Outcome);
        Assert.Equal(queries, rig.Listings.Queries); // no store read: the entry was kept
        Assert.Equal(500, after.Single().AvailableQuantity); // the cached count is out of date...
        Assert.Equal(499, (await rig.Listings.GetAsync(created.Id, Vendor))!.AvailableQuantity); // ...the store has the real one
        Assert.Equal(StockStatuses.InStock, StatusOf(after.Single())); // customers see a status, and it is still right
    }

    [Fact]
    public async Task AReserveThatMovesAListingIntoLowStockInvalidatesAndTheNextReadShowsIt()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(quantity: StockPolicy.DefaultLowStockThreshold + 1);
        Assert.Equal(StockStatuses.InStock, StatusOf((await rig.BrowseAsync()).Single()));
        var queries = rig.Listings.Queries;

        await rig.Reservation.ReserveAsync("order-1", Vendor, [(created.Id, 1)]);
        var after = await rig.BrowseAsync();

        Assert.Equal(queries + 1, rig.Listings.Queries);
        Assert.Equal(StockStatuses.Low, StatusOf(after.Single()));
    }

    [Fact]
    public async Task AReserveToSoldOutAndTheReleaseThatBringsItBackBothInvalidate()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(quantity: 2);
        await rig.BrowseAsync();

        await rig.Reservation.ReserveAsync("order-1", Vendor, [(created.Id, 2)]);
        Assert.Equal(StockStatuses.SoldOut, StatusOf((await rig.BrowseAsync()).Single()));

        await rig.Reservation.ReleaseAsync("order-1", Vendor);
        Assert.Equal(StockStatuses.Low, StatusOf((await rig.BrowseAsync()).Single()));
    }

    [Fact]
    public async Task AReserveAndAReleaseThatStayInsideOneStatusInvalidateNothing()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(quantity: 3); // low, and 3 -> 2 -> 3 stays low
        await rig.BrowseAsync();
        var queries = rig.Listings.Queries;

        await rig.Reservation.ReserveAsync("order-1", Vendor, [(created.Id, 1)]);
        await rig.Reservation.ReleaseAsync("order-1", Vendor);
        await rig.BrowseAsync();

        Assert.Equal(queries, rig.Listings.Queries);
    }

    [Fact]
    public async Task AVendorAdjustmentInvalidatesOnlyWhenTheStatusChanges()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(quantity: 500);
        await rig.BrowseAsync();
        var queries = rig.Listings.Queries;

        await rig.Service.AdjustStockAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, -10); // 500 -> 490: still in stock
        await rig.BrowseAsync();
        Assert.Equal(queries, rig.Listings.Queries);

        await rig.Service.AdjustStockAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, -485); // 490 -> 5: low
        Assert.Equal(StockStatuses.Low, StatusOf((await rig.BrowseAsync()).Single()));
        Assert.Equal(queries + 1, rig.Listings.Queries);
    }

    // ---- everything else a vendor or the platform can change ---------------------------------

    [Fact]
    public async Task AnEditInvalidatesSoANewPriceIsSeenAtOnce()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync();
        await rig.BrowseAsync();

        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, Rig.Request(priceCents: 950));

        Assert.Equal(950, (await rig.BrowseAsync()).Single().PriceCents);
    }

    [Fact]
    public async Task PublishingAndUnpublishingAreSeenAtOnce()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(status: "Draft");
        Assert.Empty(await rig.BrowseAsync()); // a draft is never served, and the empty answer is now cached

        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, Rig.Request(status: "Published"));
        Assert.Single(await rig.BrowseAsync());

        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, Rig.Request(status: "Draft"));
        Assert.Empty(await rig.BrowseAsync());
        Assert.Null(await rig.Service.GetPublicAsync(created.Id));
    }

    [Fact]
    public async Task ANewPublishedListingAppearsAtOnce()
    {
        var rig = await Rig.CreateAsync();
        await rig.CreateListingAsync("First");
        await rig.BrowseAsync();

        await rig.CreateListingAsync("Second");

        Assert.Equal(2, (await rig.BrowseAsync()).Count);
    }

    [Fact]
    public async Task ASuspensionHidesAVendorsListingsAtOnceAndAReverificationRestoresThem()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync();
        Assert.Single(await rig.BrowseAsync());

        await rig.Vendors.ApplyAsync(Vendor, verified: false, sequence: 2, DateTimeOffset.UnixEpoch);
        Assert.Empty(await rig.BrowseAsync());
        Assert.Null(await rig.Service.GetPublicAsync(created.Id));

        await rig.Vendors.ApplyAsync(Vendor, verified: true, sequence: 3, DateTimeOffset.UnixEpoch);
        Assert.Single(await rig.BrowseAsync());
        Assert.NotNull(await rig.Service.GetPublicAsync(created.Id));
    }

    [Fact]
    public async Task AnUnverifiedVendorsPublishedListingIsNeverServedFromAWarmCache()
    {
        var rig = await Rig.CreateAsync();
        await rig.CreateListingAsync();
        // A vendor that was never verified has a published listing stored directly (a suspension rewrites nothing, ListingService doc).
        await rig.Listings.SaveAsync(new ListingDocument { Id = "listing-ghost", VendorId = "vendor-unverified", Name = "Ghost", Status = ListingStatuses.Published }, "vendor-unverified");

        await rig.BrowseAsync();
        var warm = await rig.BrowseAsync();

        Assert.DoesNotContain(warm, l => l.Id == "listing-ghost");
        Assert.Null(await rig.Service.GetPublicAsync("listing-ghost"));
    }

    // ---- stampede protection (single flight) ---------------------------------------------------

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        var until = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            if (DateTime.UtcNow > until) throw new TimeoutException("the condition did not become true");
            await Task.Delay(10);
        }
    }

    [Fact]
    public async Task ManyConcurrentColdReadsLoadTheStoreOnceAndShareTheResult()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync();
        var before = rig.Listings.Queries;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = _ => gate.Task; // the one load is under way while the others arrive

        var reads = Enumerable.Range(0, 50).Select(_ => rig.BrowseAsync()).ToList();
        await WaitUntilAsync(() => rig.Cache.Coalesced >= 49);
        gate.SetResult();
        var results = await Task.WhenAll(reads);

        Assert.Equal(before + 1, rig.Listings.Queries); // fifty requests, one read of the store
        Assert.All(results, r => Assert.Equal([created.Id], r.Select(l => l.Id)));
        Assert.True(rig.Cache.Coalesced >= 49); // both keys (the vendor list and the vendor's listings) coalesce
    }

    [Fact]
    public async Task ACallerThatCancelsStopsWaitingAndTheOthersStillGetTheResult()
    {
        var rig = await Rig.CreateAsync();
        await rig.CreateListingAsync();
        var before = rig.Listings.Queries;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = _ => gate.Task;
        using var cts = new CancellationTokenSource();

        var leader = rig.Service.BrowseAsync(100, null, ct: cts.Token); // starts the load, then cancels
        var patient = rig.Service.BrowseAsync(100, null);
        await WaitUntilAsync(() => rig.Cache.Coalesced >= 1);
        await cts.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => leader);
        gate.SetResult();

        Assert.Single((await patient).Items); // the load was not cancelled with the caller that started it
        Assert.Equal(before + 1, rig.Listings.Queries);
    }

    [Fact]
    public async Task AFailedLoadIsSharedByTheCallersWaitingOnItAndIsNotKept()
    {
        var rig = await Rig.CreateAsync();
        await rig.CreateListingAsync();
        var before = rig.Listings.Queries;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = async n =>
        {
            await gate.Task;
            if (n == before + 1) throw new InvalidOperationException("store down");
        };

        var first = rig.BrowseAsync();
        var second = rig.BrowseAsync();
        await WaitUntilAsync(() => rig.Cache.Coalesced >= 1);
        gate.SetResult();

        await Assert.ThrowsAsync<InvalidOperationException>(() => first);
        await Assert.ThrowsAsync<InvalidOperationException>(() => second);
        Assert.Equal(before + 1, rig.Listings.Queries); // one failing load, shared

        rig.Listings.AfterRead = null;
        Assert.Single(await rig.BrowseAsync()); // the next call tries again: the failure was not kept
    }

    [Fact]
    public async Task ALoadThatBeganBeforeAWriteDoesNotFillTheCacheWithWhatItRead()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync(); // priced 800
        var held = rig.Listings.Queries + 1;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = n => n == held ? gate.Task : Task.CompletedTask;
        await rig.Cache.InvalidateVendorAsync(Vendor); // an empty cache: the next read loads

        var stale = rig.BrowseAsync(); // reads 800, then is held
        await WaitUntilAsync(() => rig.Listings.Queries == held);
        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, Rig.Request(priceCents: 950)); // the write
        gate.SetResult();

        Assert.Equal(800, (await stale).Single().PriceCents); // the caller that was already waiting gets what the load read
        Assert.Equal(950, (await rig.BrowseAsync()).Single().PriceCents); // but it did not put that in the cache: the next read goes to the store
    }

    [Fact]
    public async Task ARequestAfterAWriteDoesNotJoinALoadThatBeganBeforeIt()
    {
        var rig = await Rig.CreateAsync();
        var created = await rig.CreateListingAsync();
        var held = rig.Listings.Queries + 1;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = n => n == held ? gate.Task : Task.CompletedTask;
        await rig.Cache.InvalidateVendorAsync(Vendor);

        var stale = rig.BrowseAsync();
        await WaitUntilAsync(() => rig.Listings.Queries == held);
        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(created.Id, Vendor))!, Rig.Request(priceCents: 950));
        var fresh = await rig.BrowseAsync().WaitAsync(TimeSpan.FromSeconds(5)); // starts its own load; the held one is still held (a join would wait here)

        Assert.Equal(950, fresh.Single().PriceCents);
        Assert.False(stale.IsCompleted);
        gate.SetResult();
        await stale;
    }

    [Fact]
    public async Task WithTheCacheOffNothingIsCoalesced()
    {
        var rig = await Rig.CreateAsync(ttlSeconds: 0);
        await rig.CreateListingAsync();
        var before = rig.Listings.Queries;
        var gate = new TaskCompletionSource();
        rig.Listings.AfterRead = _ => gate.Task;

        var reads = Enumerable.Range(0, 3).Select(_ => rig.BrowseAsync()).ToList();
        await WaitUntilAsync(() => rig.Listings.Queries == before + 3);
        gate.SetResult();
        await Task.WhenAll(reads);

        Assert.Equal(0, rig.Cache.Coalesced);
    }

    // ---- failure behaviour -------------------------------------------------------------------

    [Fact]
    public async Task AFailingCacheNeverFailsAReadAndTheFiltersStillHold()
    {
        var rig = await Rig.CreateAsync(new ThrowingCache());
        var published = await rig.CreateListingAsync("Visible");
        await rig.CreateListingAsync("Hidden draft", status: "Draft");

        var page = await rig.BrowseAsync();

        Assert.Equal([published.Id], page.Select(l => l.Id));
        Assert.NotNull(await rig.Service.GetPublicAsync(published.Id));
        // Writes and the verification change succeed although their invalidation fails.
        await rig.Service.UpdateAsync((await rig.Listings.GetAsync(published.Id, Vendor))!, Rig.Request(priceCents: 900));
        await rig.Vendors.ApplyAsync(Vendor, verified: false, sequence: 2, DateTimeOffset.UnixEpoch);
        Assert.Empty(await rig.BrowseAsync());
    }

    [Fact]
    public async Task WhenTheCacheRedisFailsTheResilientProviderServesFromTheLocalFallback()
    {
        var local = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var resilient = new ResilientCacheProvider(
            new ThrowingCache(), local, new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 1, durationOfBreak: TimeSpan.FromMinutes(1)),
            NullLogger<ResilientCacheProvider>.Instance);
        var rig = await Rig.CreateAsync(resilient);
        await rig.CreateListingAsync();

        await rig.BrowseAsync();
        var queries = rig.Listings.Queries;
        await rig.BrowseAsync();

        Assert.Equal(queries, rig.Listings.Queries); // the fallback held the entry: still a warm read with the primary down
    }

    // ---- what a customer may see --------------------------------------------------------------

    [Fact]
    public async Task ACustomersViewOfACachedListingNeverCarriesTheQuantityOrTheThreshold()
    {
        var rig = await Rig.CreateAsync();
        await rig.Service.CreateAsync(Vendor, Rig.Request(quantity: 42, threshold: 7));
        var cached = (await rig.BrowseAsync()).Single();
        Assert.Equal(42, cached.AvailableQuantity); // the cached document does hold them: the test is only meaningful if so
        Assert.Equal(7, cached.LowStockThreshold);

        var tags = new TagProjector(TagRegistry.LoadEmbedded(), TimeProvider.System);
        var json = JsonSerializer.Serialize(ListingDto.From(cached, tags), JsonSerializerOptions.Web);

        // The public stock block is a status and the per-order limit: the exact quantity and the threshold are absent or null (never 42 or 7).
        var stock = JsonDocument.Parse(json).RootElement.GetProperty("stock");
        foreach (var property in stock.EnumerateObject().Where(p => p.Name is "availableQuantity" or "lowStockThreshold"))
            Assert.Equal(JsonValueKind.Null, property.Value.ValueKind);
        Assert.Equal("inStock", stock.GetProperty("status").GetString());
    }
}
