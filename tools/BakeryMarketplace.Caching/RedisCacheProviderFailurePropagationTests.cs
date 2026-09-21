using BakeryMarketplace.Caching;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;

namespace BakeryMarketplace.Caching.Tests;

/// <summary>
/// Regression tests for the 2026-09-16 fix to <see cref="RedisCacheProvider.GetAsync{T}"/>.
///
/// Prior to this fix, GetAsync wrapped its Redis call in a try/catch that swallowed
/// every exception and returned CacheResult&lt;T&gt;.Miss(), which made a real Redis
/// connectivity failure indistinguishable from a normal cache miss to any caller —
/// including ResilientCacheProvider's circuit breaker, which never saw the failure
/// and therefore never tripped or fell back to LocalCacheProvider. These tests prove:
///   1. GetAsync itself propagates a connection failure as an exception, not a Miss.
///   2. When wrapped by ResilientCacheProvider, that propagation is exactly what lets
///      the breaker trip and route reads to the local fallback (the behavior
///      CacheProviderContractTests/ResilientCacheProviderTests could not catch, since
///      they exercise only the happy path and TTL expiry against RedisCacheProvider
///      directly, never a simulated primary-connection failure).
///   3. A non-connectivity problem (malformed JSON payload) is still correctly
///      reported as a Miss, not mistaken for a connection failure.
///
/// See WI-CACHE-002, WI-CACHE-003, ADR-0002.
/// </summary>
public sealed class RedisCacheProviderFailurePropagationTests
{
    /// <summary>
    /// A fake IDatabase whose StringGetAsync always throws, simulating an unreachable
    /// Redis instance (connection failure / timeout) without needing a real outage.
    /// Only the members RedisCacheProvider actually calls are implemented for real;
    /// everything else throws NotImplementedException so an unexpected call fails loudly.
    /// </summary>
    private sealed class AlwaysFailingDatabase : IDatabase
    {
        public Task<RedisValue> StringGetAsync(RedisKey key, CommandFlags flags = CommandFlags.None) =>
            throw new RedisConnectionException(ConnectionFailureType.UnableToConnect, "Simulated Redis outage.");

        // --- Everything below is unused by RedisCacheProvider; not implemented. ---
        public IConnectionMultiplexer Multiplexer => throw new NotImplementedException();
        object IDatabaseAsync.this[RedisKey key] => throw new NotImplementedException();
        // (Remaining IDatabase members intentionally omitted for brevity in this fake;
        //  a real test double would need a full implementation or a mocking library
        //  such as NSubstitute/Moq. This sketch illustrates the intended test shape.)
    }

    [Fact]
    public async Task GetAsync_ConnectionFailure_ThrowsInsteadOfReturningMiss()
    {
        // Arrange
        var failingDb = new AlwaysFailingDatabase();
        var sut = new RedisCacheProvider(failingDb);

        // Act & Assert — the fixed GetAsync must let the RedisConnectionException
        // propagate, not catch it and return CacheResult<T>.Miss().
        await Assert.ThrowsAsync<RedisConnectionException>(
            () => sut.GetAsync<string>("any-key"));
    }

    [Fact]
    public async Task ResilientCacheProvider_GetAsync_FallsBackToLocalCache_WhenRedisPrimaryFails()
    {
        // Arrange — RedisCacheProvider (now correctly throwing) as the primary,
        // wrapped by ResilientCacheProvider, same shape as ResilientCacheProviderTests.
        var failingDb = new AlwaysFailingDatabase();
        var redisPrimary = new RedisCacheProvider(failingDb);

        var memCache = new MemoryCache(new MemoryCacheOptions());
        var fallback = new LocalCacheProvider(memCache);
        await fallback.SetAsync("key", "fallback-value");

        var breaker = new PollyCircuitBreakerPolicy(exceptionsAllowedBeforeBreaking: 1,
            durationOfBreak: TimeSpan.FromSeconds(30));
        var logger = NullLogger<ResilientCacheProvider>.Instance;
        var resilient = new ResilientCacheProvider(redisPrimary, fallback, breaker, logger);

        // Act
        var result = await resilient.GetAsync<string>("key");

        // Assert — before the fix, GetAsync's swallowed exception meant this call would
        // return Miss (Found == false) straight from RedisCacheProvider, and the breaker
        // would never open or route to the fallback at all.
        Assert.True(result.Found, "Should fail over to LocalCacheProvider once Redis throws.");
        Assert.Equal("fallback-value", result.Value);
    }

    [Fact]
    public async Task GetAsync_MalformedJson_ReturnsMiss_NotException()
    {
        // Arrange — Redis itself is reachable and returns a value, but it isn't valid
        // JSON for the requested type (e.g. leftover data from an incompatible schema).
        // This must still be treated as a Miss, not as a connectivity failure.
        var db = new StubReturningRawStringDatabase("not-valid-json-for-a-poco");
        var sut = new RedisCacheProvider(db);

        // Act
        var result = await sut.GetAsync<SamplePayload>("key");

        // Assert
        Assert.False(result.Found);
    }

    private record SamplePayload(string Name);

    /// <summary>
    /// Minimal fake that returns a fixed raw string from StringGetAsync, to exercise
    /// the deserialization-failure branch without a real Redis instance.
    /// </summary>
    private sealed class StubReturningRawStringDatabase : IDatabase
    {
        private readonly RedisValue _value;
        public StubReturningRawStringDatabase(string value) => _value = value;

        public Task<RedisValue> StringGetAsync(RedisKey key, CommandFlags flags = CommandFlags.None) =>
            Task.FromResult(_value);

        public IConnectionMultiplexer Multiplexer => throw new NotImplementedException();
        object IDatabaseAsync.this[RedisKey key] => throw new NotImplementedException();
        // (Remaining IDatabase members intentionally omitted — see note above.)
    }
}
