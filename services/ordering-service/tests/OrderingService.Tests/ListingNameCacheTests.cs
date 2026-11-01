using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>Register item 113: the names behind the ids in the vendor view are held, shared by concurrent callers, and refreshed in the background.</summary>
public class ListingNameCacheTests
{
    private const string Sourdough = "listing-sourdough-001";
    private const string Croissant = "listing-croissant-001";

    private readonly FakeCatalog _catalog = FakeCatalog.WithTheSeed();
    private readonly ManualTime _time = new(new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero));
    private readonly ListingNameOptions _options = new();

    private ListingNameCache NewCache() => new(_catalog, Options.Create(_options), _time, NullLogger<ListingNameCache>.Instance);

    [Fact]
    public async Task ANameIsFetchedOnceAndThenServedFromTheCacheHoweverManyOrdersAsk()
    {
        var cache = NewCache();

        for (var order = 0; order < 25; order++)
        {
            var names = await cache.GetManyAsync([Sourdough, Sourdough, Croissant]);
            Assert.Equal("Country Sourdough", names[Sourdough].Name);
            Assert.Equal("Seed crust", names[Sourdough].Modifiers["mod-seeds"]);
        }

        Assert.Equal(2, _catalog.ListingReads); // one per distinct listing, not per order
        Assert.Equal(2, cache.Fetches);
    }

    [Fact]
    public async Task ManyCallersAskingForTheSameMissAtOnceShareOneFetch()
    {
        var cache = NewCache();
        _catalog.Gate = new TaskCompletionSource();

        var callers = Enumerable.Range(0, 50).Select(_ => cache.GetManyAsync([Sourdough])).ToList();
        await Task.Delay(50); // every caller is now waiting on the one fetch
        _catalog.Gate.SetResult();
        var results = await Task.WhenAll(callers);

        Assert.Equal(1, _catalog.ListingReads);
        Assert.All(results, r => Assert.Equal("Country Sourdough", r[Sourdough].Name));
    }

    [Fact]
    public async Task AListingTheCatalogDoesNotKnowIsRememberedAsUnknownAndNotAskedForAgainUntilTheRefresh()
    {
        var cache = NewCache();

        var first = await cache.GetManyAsync(["listing-gone"]);
        var second = await cache.GetManyAsync(["listing-gone"]);

        Assert.Null(first["listing-gone"].Name);
        Assert.Null(second["listing-gone"].Name);
        Assert.Equal(1, _catalog.ListingReads);
    }

    [Fact]
    public async Task ACatalogOutageOnAMissGivesNoNameInsteadOfAnErrorAndIsNotRetriedStraightAway()
    {
        var cache = NewCache();
        _catalog.ListingReadsFail = true;

        var down = await cache.GetManyAsync([Sourdough]);
        var again = await cache.GetManyAsync([Sourdough]);
        var attemptsDuringOutage = _catalog.ListingReads;
        _catalog.ListingReadsFail = false;
        _time.Now = _time.Now.AddSeconds(_options.FailureBackoffSeconds + 1);
        var recovered = await cache.GetManyAsync([Sourdough]);

        Assert.False(down.ContainsKey(Sourdough));
        Assert.False(again.ContainsKey(Sourdough));
        Assert.Equal(1, attemptsDuringOutage); // the outage cost one attempt, not one per request
        Assert.Equal("Country Sourdough", recovered[Sourdough].Name);
    }

    [Fact]
    public async Task TheRefreshPicksUpARenamedListingAndKeepsTheOldNameWhileTheCatalogIsDown()
    {
        var cache = NewCache();
        await cache.GetManyAsync([Sourdough]);

        _catalog.Listings[Sourdough] = _catalog.Listings[Sourdough] with { Name = "Rye Sourdough" };
        Assert.Equal("Country Sourdough", (await cache.GetManyAsync([Sourdough]))[Sourdough].Name); // not refreshed yet
        _time.Now = _time.Now.AddMinutes(_options.RefreshMinutes + 1);
        _catalog.ListingReadsFail = true;
        await cache.RefreshStaleAsync();
        Assert.Equal("Country Sourdough", (await cache.GetManyAsync([Sourdough]))[Sourdough].Name); // the old name beats no name

        _catalog.ListingReadsFail = false;
        _time.Now = _time.Now.AddSeconds(_options.FailureBackoffSeconds + 1);
        var refreshed = await cache.RefreshStaleAsync();

        Assert.Equal(1, refreshed);
        Assert.Equal("Rye Sourdough", (await cache.GetManyAsync([Sourdough]))[Sourdough].Name);
    }

    [Fact]
    public async Task AnEntryTheRefreshHasNotRenewedForTooLongIsNotServed()
    {
        var cache = NewCache();
        await cache.GetManyAsync([Sourdough]);
        _catalog.ListingReadsFail = true;
        _time.Now = _time.Now.AddMinutes(_options.MaxAgeMinutes + 1);

        var result = await cache.GetManyAsync([Sourdough]);

        Assert.False(result.ContainsKey(Sourdough)); // too old to trust, and the catalog cannot be asked: the view falls back to ids
    }

    [Fact]
    public async Task EntriesNobodyAsksForAreDroppedAndTheCacheStaysWithinItsSize()
    {
        _options.MaxEntries = 2;
        var cache = NewCache();
        await cache.GetManyAsync([Sourdough]);
        _time.Now = _time.Now.AddMinutes(1);
        await cache.GetManyAsync([Croissant]);
        _time.Now = _time.Now.AddMinutes(1);
        await cache.GetManyAsync(["listing-latte-001"]);

        Assert.Equal(2, cache.Count);

        _time.Now = _time.Now.AddHours(_options.RetainHours + 1);
        await cache.RefreshStaleAsync();

        Assert.Equal(0, cache.Count);
    }
}
