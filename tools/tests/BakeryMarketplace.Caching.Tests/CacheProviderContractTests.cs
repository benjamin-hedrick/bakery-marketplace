using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Shared contract test suite for all <see cref="ICacheProvider"/> implementations.
/// A new implementation "inherits" these tests by subclassing and overriding <see cref="CreateProvider"/>.
/// See WI-CACHE-001 acceptance criteria.
/// </summary>
public abstract class CacheProviderContractTests : IDisposable
{
    private readonly ICacheProvider _provider;

    protected CacheProviderContractTests()
    {
        _provider = CreateProvider();
    }

    /// <summary>
    /// Factory method — subclasses return the specific <see cref="ICacheProvider"/> under test.
    /// </summary>
    protected abstract ICacheProvider CreateProvider();

    public virtual void Dispose() { }

    [Fact]
    public async Task SetThenGet_ReturnsStoredValue()
    {
        // Arrange
        const string key = "test:set-get";
        const string expected = "hello-bakery";

        // Act
        await _provider.SetAsync(key, expected);
        var result = await _provider.GetAsync<string>(key);

        // Assert
        Assert.True(result.Found);
        Assert.Equal(expected, result.Value);
    }

    [Fact]
    public async Task GetMissingKey_ReturnsMiss_NotException()
    {
        // Arrange
        var key = $"test:missing:{Guid.NewGuid()}";

        // Act — must NOT throw
        var result = await _provider.GetAsync<string>(key);

        // Assert
        Assert.False(result.Found);
        Assert.Null(result.Value);
    }

    [Fact]
    public async Task GetMany_ReturnsOnlyTheKeysThatWereFound()
    {
        var id = Guid.NewGuid();
        await _provider.SetAsync($"test:many:{id}:a", "A");
        await _provider.SetAsync($"test:many:{id}:c", "C");

        var result = await _provider.GetManyAsync<string>(
            new[] { $"test:many:{id}:a", $"test:many:{id}:b", $"test:many:{id}:c" });

        Assert.Equal(2, result.Count);
        Assert.Equal("A", result[$"test:many:{id}:a"]);
        Assert.Equal("C", result[$"test:many:{id}:c"]);
        Assert.False(result.ContainsKey($"test:many:{id}:b"));
    }

    [Fact]
    public async Task GetMany_WithDuplicateKeys_ReadsEachOnce_AndWithNoKeys_ReturnsEmpty()
    {
        var key = $"test:many-dup:{Guid.NewGuid()}";
        await _provider.SetAsync(key, "v");

        var result = await _provider.GetManyAsync<string>(new[] { key, key });
        var none = await _provider.GetManyAsync<string>(Array.Empty<string>());

        Assert.Single(result);
        Assert.Empty(none);
    }

    [Fact]
    public async Task GetMany_AfterDelete_OmitsTheKey()
    {
        var key = $"test:many-del:{Guid.NewGuid()}";
        await _provider.SetAsync(key, "v");
        await _provider.DeleteAsync(key);

        Assert.Empty(await _provider.GetManyAsync<string>(new[] { key }));
    }

    [Fact]
    public async Task DeleteThenGet_ReturnsMiss()
    {
        // Arrange
        const string key = "test:delete";
        await _provider.SetAsync(key, "to-be-deleted");

        // Act
        await _provider.DeleteAsync(key);
        var result = await _provider.GetAsync<string>(key);

        // Assert
        Assert.False(result.Found, "Get after Delete must return Miss.");
    }

    [Fact]
    public async Task SetWithTtl_IsMissAfterExpiry()
    {
        // Arrange
        var key = $"test:ttl:{Guid.NewGuid()}";
        var shortTtl = TimeSpan.FromMilliseconds(50);

        // Act
        await _provider.SetAsync(key, "expiring", ttl: shortTtl);
        await Task.Delay(TimeSpan.FromMilliseconds(200)); // wait for TTL to elapse
        var result = await _provider.GetAsync<string>(key);

        // Assert
        Assert.False(result.Found, "Key should be a Miss after TTL elapsed.");
    }
}
