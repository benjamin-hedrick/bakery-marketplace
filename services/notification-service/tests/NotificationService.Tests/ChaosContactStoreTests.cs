using BakeryMarketplace.Caching;
using BakeryMarketplace.Chaos;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using NotificationService.Chaos;
using NotificationService.Contacts;

namespace NotificationService.Tests;

/// <summary>With every setting off the chaos store is invisible: it returns what the store returns.</summary>
public sealed class ChaosContactStorePassThroughTests
{
    [Fact]
    public async Task WithNoFaultItReturnsTheStoresAnswer()
    {
        var inner = SeededContactDirectoryTests.Seed();
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("off", 1, "contacts"));
        var store = new ChaosContactStore(inner, runtime.Layer("contacts"));

        var found = await store.GetContactsAsync(["c1", "ghost"]);

        Assert.Equal(["c1"], found.Keys);
        Assert.Equal(0, runtime.Journal.Count("contacts", "failure"));
    }
}

/// <summary>The contacts layer: a store that fails, seen through the cache the service really puts above it.</summary>
public sealed class ChaosContactStoreTests
{
    private static (CachedContactDirectory Directory, ChaosRuntime Runtime) Build(params (string Setting, double Value)[] settings)
    {
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("contacts-test", 1, "contacts", settings));
        var store = new ChaosContactStore(SeededContactDirectoryTests.Seed(), runtime.Layer("contacts"));
        var cache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        return (new CachedContactDirectory(store, cache, NullLogger<CachedContactDirectory>.Instance), runtime);
    }

    [Fact]
    public async Task AColdCacheOverAFailingStore_PassesTheFailureOn_SoTheNotifierRetriesTheBatch()
    {
        var (directory, runtime) = Build(("failureRate", 1));

        await Assert.ThrowsAsync<InvalidOperationException>(() => directory.GetContactsAsync(["c1"]));

        Assert.Equal(1, runtime.Journal.Count("contacts", "failure"));
    }

    [Fact]
    public async Task AWarmCacheHidesAStoreThatHasFailedSince()
    {
        var cache = new LocalCacheProvider(new MemoryCache(new MemoryCacheOptions()));
        var log = NullLogger<CachedContactDirectory>.Instance;
        await new CachedContactDirectory(SeededContactDirectoryTests.Seed(), cache, log).GetContactsAsync(["c1"]); // warmed while the store worked
        var runtime = ChaosRuntime.ForTests(ChaosScenario.Of("contacts-test", 1, "contacts", ("failureRate", 1)));
        var failing = new CachedContactDirectory(new ChaosContactStore(SeededContactDirectoryTests.Seed(), runtime.Layer("contacts")), cache, log);

        var found = await failing.GetContactsAsync(["c1"]);

        Assert.Contains("c1", found.Keys);
        Assert.Equal(0, runtime.Journal.Count("contacts", "failure")); // the store was never asked
    }

    [Fact]
    public async Task APersonsIdentityNeverReachesTheJournal()
    {
        var (directory, runtime) = Build(("failureRate", 1));

        await Assert.ThrowsAsync<InvalidOperationException>(() => directory.GetContactsAsync(["c1"]));

        Assert.DoesNotContain(runtime.Journal.Entries, e => e.Key.Contains('@') || e.Key.Contains("Alice"));
    }
}
