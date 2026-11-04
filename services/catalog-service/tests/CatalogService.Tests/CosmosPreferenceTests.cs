using BakeryMarketplace.Data;
using CatalogService.Preferences;
using CatalogService.Tags;
using Microsoft.Azure.Cosmos;

namespace CatalogService.Tests;

/// <summary>
/// WI-PREF-001 on the real Cosmos SDK (runs only with COSMOS_CONNECTION_STRING, otherwise skipped): the <c>preferences</c> container is
/// partitioned by <c>/customerId</c> and the document's property names match that path, a profile round-trips with its lists intact, and one
/// customer's partition never returns another's profile.
/// </summary>
public sealed class CosmosPreferenceTests : IAsyncLifetime
{
    private CosmosClient? _client;
    private Container? _container;
    private PreferenceService? _service;
    private readonly string _database = "preferences-" + Guid.NewGuid().ToString("N")[..8];

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(EmulatorFactAttribute.ConnectionString)) return;
        _client = new CosmosClient(EmulatorFactAttribute.ConnectionString, new CosmosClientOptions
        {
            ConnectionMode = ConnectionMode.Gateway,
            HttpClientFactory = () => new HttpClient(new HttpClientHandler { ServerCertificateCustomValidationCallback = (_, _, _, _) => true }),
        });
        var db = (await _client.CreateDatabaseIfNotExistsAsync(_database)).Database;
        // The same definition Program.cs creates in local development and Terraform creates in the dev environment.
        _container = (await db.CreateContainerIfNotExistsAsync(new ContainerProperties("preferences", "/customerId"))).Container;
        _service = new PreferenceService(new CosmosRepository<PreferenceProfileDocument>(_container), TagRegistry.LoadEmbedded(), TimeProvider.System);
    }

    public async Task DisposeAsync()
    {
        if (_client is null) return;
        try { await _client.GetDatabase(_database).DeleteAsync(); } catch { /* best effort cleanup */ }
        _client.Dispose();
    }

    [EmulatorFact]
    public async Task A_profile_round_trips_through_cosmos_and_is_stored_under_the_customers_own_partition()
    {
        var saved = await _service!.ReplaceAsync("customer-a", new PreferencesRequest(["tree-nut", "sesame"], ["dairy"]));
        var read = await _service.GetAsync("customer-a");
        // Read it the way the store does, by partition key, to prove the document's property names match the container's path.
        var raw = await _container!.ReadItemAsync<PreferenceProfileDocument>("customer-a", new PartitionKey("customer-a"));

        Assert.Equal(PreferenceOutcome.Saved, saved.Outcome);
        Assert.Equal(["tree-nut", "sesame"], read.Allergies);
        Assert.Equal(["dairy"], read.Avoid);
        Assert.Equal("customer-a", raw.Resource.CustomerId);
    }

    [EmulatorFact]
    public async Task One_customers_partition_never_returns_another_customers_profile()
    {
        await _service!.ReplaceAsync("customer-a", new PreferencesRequest(["tree-nut"], []));
        await _service.ReplaceAsync("customer-b", new PreferencesRequest(["sesame"], []));
        var repository = new CosmosRepository<PreferenceProfileDocument>(_container!);

        var wrongPartition = await repository.GetAsync("customer-a", "customer-b");
        var b = await _service.GetAsync("customer-b");

        Assert.Null(wrongPartition);
        Assert.Equal(["sesame"], b.Allergies);
    }

    [EmulatorFact]
    public async Task A_second_save_replaces_the_profile_and_an_unknown_customer_has_the_empty_one()
    {
        await _service!.ReplaceAsync("customer-a", new PreferencesRequest(["tree-nut"], ["dairy"]));
        await _service.ReplaceAsync("customer-a", new PreferencesRequest(["sesame"], []));

        var read = await _service.GetAsync("customer-a");
        var nobody = await _service.GetAsync("customer-nobody");

        Assert.Equal(["sesame"], read.Allergies);
        Assert.Empty(read.Avoid);
        Assert.Empty(nobody.Allergies);
        Assert.Null(nobody.UpdatedAt);
    }
}
