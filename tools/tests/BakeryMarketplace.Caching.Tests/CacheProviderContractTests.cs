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
