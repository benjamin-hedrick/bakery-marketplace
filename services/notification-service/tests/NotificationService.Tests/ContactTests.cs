using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Contacts;

namespace NotificationService.Tests;

/// <summary>Shared contract for every <see cref="IContactDirectory"/>; an implementation inherits it by overriding <see cref="Create"/>.</summary>
public abstract class ContactDirectoryContractTests
{
    /// <summary>A directory that knows exactly <c>c1</c> and <c>c2</c>.</summary>
    protected abstract IContactDirectory Create();

    [Fact]
    public async Task ReturnsOnlyTheCustomersThatExist()
    {
        var result = await Create().GetContactsAsync(["c1", "nobody", "c2"]);

        Assert.Equal(2, result.Count);
        Assert.Equal("c1@example.test", result["c1"].Email);
        Assert.False(result.ContainsKey("nobody"));
    }

    [Fact]
    public async Task DuplicateIdsAndAnEmptyListAreFine()
    {
        var directory = Create();

        Assert.Single(await directory.GetContactsAsync(["c1", "c1"]));
        Assert.Empty(await directory.GetContactsAsync([]));
    }

    [Fact]
    public async Task AnUnknownCustomerIsAbsentNotAnError()
    {
        Assert.Empty(await Create().GetContactsAsync(["never-heard-of-them"]));
    }
}

public sealed class SeededContactDirectoryTests : ContactDirectoryContractTests
{
    protected override IContactDirectory Create() => Seed();

    internal static SeededContactDirectory Seed() => new(
    [
        new Contact("c1", "c1@example.test", "Customer One"),
        new Contact("c2", "c2@example.test", "Customer Two"),
    ]);

    [Fact]
    public async Task TheMockIdentitysCustomerIsSeeded()
    {
        var found = await SeededContactDirectory.FromMockIdentity().GetContactsAsync(["user-customer-1", "user-vendor-1"]);

        Assert.Equal("alice@customer.local", Assert.Single(found).Value.Email); // the vendor is not a customer
    }
}

/// <summary>Counts reads so a test can show how many batch calls reached the directory.</summary>
internal sealed class CountingDirectory(IContactDirectory inner) : IContactDirectory
{
    public List<string[]> Calls { get; } = [];

    public Task<IReadOnlyDictionary<string, Contact>> GetContactsAsync(IReadOnlyCollection<string> customerIds, CancellationToken ct = default)
    {
        lock (Calls) Calls.Add(customerIds.ToArray());
        return inner.GetContactsAsync(customerIds, ct);
    }
}

public sealed class CachedContactDirectoryTests : ContactDirectoryContractTests
{
    private static LocalCacheProvider NewCache() => new(new MemoryCache(new MemoryCacheOptions()));

    private static CachedContactDirectory Cached(IContactDirectory inner, ICacheProvider cache, TimeSpan? negativeTtl = null) =>
        new(inner, cache, NullLogger<CachedContactDirectory>.Instance, negativeTtl: negativeTtl);

    protected override IContactDirectory Create() => Cached(SeededContactDirectoryTests.Seed(), NewCache());

    [Fact]
    public async Task ManyMissesAreOneBatchReadOfTheDirectory_AndTheNextReadIsServedFromTheCache()
    {
        var inner = new CountingDirectory(SeededContactDirectoryTests.Seed());
        var directory = Cached(inner, NewCache());

        await directory.GetContactsAsync(["c1", "c2"]);
        await directory.GetContactsAsync(["c1", "c2"]);

        Assert.Equal([["c1", "c2"]], inner.Calls); // one call for both ids; none the second time
    }

    [Fact]
    public async Task OnlyTheMissesAreReadFromTheDirectory()
    {
        var inner = new CountingDirectory(SeededContactDirectoryTests.Seed());
        var directory = Cached(inner, NewCache());
        await directory.GetContactsAsync(["c1"]);

        var result = await directory.GetContactsAsync(["c1", "c2"]);

        Assert.Equal(2, result.Count);
        Assert.Equal([["c1"], ["c2"]], inner.Calls);
    }

    [Fact]
    public async Task AnUnknownCustomerIsRememberedBrieflyAndReadAgainAfterThat()
    {
        var inner = new CountingDirectory(SeededContactDirectoryTests.Seed());
        var directory = Cached(inner, NewCache(), negativeTtl: TimeSpan.FromMilliseconds(500));

        await directory.GetContactsAsync(["ghost"]);
        await directory.GetContactsAsync(["ghost"]);
        Assert.Single(inner.Calls);

        await Task.Delay(900);
        await directory.GetContactsAsync(["ghost"]);
        Assert.Equal(2, inner.Calls.Count);
    }

    [Fact]
    public async Task ACacheThatIsDownReadsThroughToTheDirectory()
    {
        var inner = new CountingDirectory(SeededContactDirectoryTests.Seed());
        var directory = Cached(inner, new BrokenCache());

        var result = await directory.GetContactsAsync(["c1", "c2"]);

        Assert.Equal(2, result.Count);
        Assert.Single(inner.Calls);
    }

    private sealed class BrokenCache : ICacheProvider
    {
        private static InvalidOperationException Down() => new("cache is down");
        public Task<CacheResult<T>> GetAsync<T>(string key, CancellationToken ct = default) => throw Down();
        public Task<IReadOnlyDictionary<string, T>> GetManyAsync<T>(IReadOnlyCollection<string> keys, CancellationToken ct = default) => throw Down();
        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken ct = default) => throw Down();
        public Task DeleteAsync(string key, CancellationToken ct = default) => throw Down();
        public Task<bool> ExistsAsync(string key, CancellationToken ct = default) => throw Down();
    }
}
