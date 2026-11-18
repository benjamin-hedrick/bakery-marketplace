using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using BakeryMarketplace.Data;
using CatalogService.Api;
using CatalogService.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CatalogService.Tests;

/// <summary>
/// Register 206: with Cosmos stopped, the catalog's reads failed with an unhandled 500 (ordering answers its own with 503). An unreachable store is
/// now a 503 with Retry-After and a fixed body that says nothing about the store.
/// </summary>
public sealed class StoreUnavailableResponseTests : IDisposable
{
    private sealed class UnreachableRepository<T> : IRepository<T> where T : class
    {
        private static StoreUnavailableException Down() =>
            new("The store could not be reached.", HttpStatusCode.ServiceUnavailable, new HttpRequestException("connection refused (localhost:8081)"));

        public Task<T?> GetAsync(string id, string partitionKey, CancellationToken ct = default) => throw Down();
        public Task<T> SaveAsync(T entity, string partitionKey, CancellationToken ct = default) => throw Down();
        public Task DeleteAsync(string id, string partitionKey, CancellationToken ct = default) => throw Down();

        public async IAsyncEnumerable<T> QueryAsync(string partitionKey, Func<IQueryable<T>, IQueryable<T>> query, [EnumeratorCancellation] CancellationToken ct = default)
        {
            await Task.Yield();
            throw Down();
#pragma warning disable CS0162 // an iterator needs a yield
            yield break;
#pragma warning restore CS0162
        }

        public IAsyncEnumerable<T> QueryAcrossPartitionsAsync(Func<IQueryable<T>, IQueryable<T>> query, CancellationToken ct = default) =>
            QueryAsync("all", query, ct);
    }

    private readonly CatalogFactory _factory = new();
    private readonly HttpClient _client;

    public StoreUnavailableResponseTests()
    {
        _client = _factory.WithWebHostBuilder(web => web.ConfigureServices(services =>
        {
            // The whole store is down: the listings and the vendors' status (a public read looks up the verified vendors first).
            services.RemoveAll<IRepository<ListingDocument>>();
            services.AddSingleton<IRepository<ListingDocument>>(new UnreachableRepository<ListingDocument>());
            services.RemoveAll<IRepository<VendorStatusDocument>>();
            services.AddSingleton<IRepository<VendorStatusDocument>>(new UnreachableRepository<VendorStatusDocument>());
        })).CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Theory]
    [InlineData("/catalog/listings/")]
    [InlineData("/catalog/listings/listing-croissant-001")]
    public async Task APublicReadAnswers503WithRetryAfter_AndNothingAboutTheStore(string path)
    {
        var response = await _client.GetAsync(path);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(StoreUnavailableResponse.RetryAfterSeconds), response.Headers.RetryAfter?.Delta);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("store_unavailable", body);
        Assert.DoesNotContain("8081", body);
        Assert.DoesNotContain("Exception", body);
    }

    [Fact]
    public async Task AVendorsOwnReadAnswers503Too()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/catalog/listings/mine");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _factory.Token("vendor-shop-001", "Vendor"));

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("store_unavailable", (await response.Content.ReadFromJsonAsync<ApiError>())!.Code);
    }
}
