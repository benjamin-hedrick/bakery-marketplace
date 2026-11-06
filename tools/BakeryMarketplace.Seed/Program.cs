// Local-dev seed (WI-DEV-004). Run after `docker compose up` (node scripts/dev/check-env.mjs --wait 90):
//
//   Cosmos__ConnectionString="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator key>" dotnet run --project tools/BakeryMarketplace.Seed
//
// Settings use the same names as catalog-service so one env file serves both. Redis__ConnectionString defaults to
// localhost:6379; Cosmos__Database to "bakery". Refuses to run against a non-local Cosmos endpoint.
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using CatalogService.Domain;
using CatalogService.Preferences;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Configuration;
using StackExchange.Redis;

namespace BakeryMarketplace.Seed;

// An explicit entry point, not top-level statements: those generate a global `Program` class, which collides with
// CatalogService's `Program` in any project (the catalog tests) that references both.
internal static class SeedProgram
{
    private static async Task<int> Main(string[] args)
    {
        var config = new ConfigurationBuilder().AddEnvironmentVariables().AddCommandLine(args).Build();

        var cosmosConnection = config["Cosmos:ConnectionString"];
        if (string.IsNullOrWhiteSpace(cosmosConnection))
        {
            Console.Error.WriteLine("Cosmos__ConnectionString is required (see docs/operations/local-dev.md).");
            return 2;
        }

        var endpoint = cosmosConnection.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(p => p.StartsWith("AccountEndpoint=", StringComparison.OrdinalIgnoreCase))?["AccountEndpoint=".Length..];
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || !uri.IsLoopback)
        {
            Console.Error.WriteLine("Refusing to seed: the Cosmos endpoint is not a loopback address. The seed is for the local emulator only.");
            return 2;
        }

        var database = config["Cosmos:Database"] ?? "bakery";
        var cosmos = new CosmosClient(cosmosConnection, new CosmosClientOptions { ConnectionMode = ConnectionMode.Gateway, LimitToEndpoint = true });
        var db = (await cosmos.CreateDatabaseIfNotExistsAsync(database)).Database;
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("catalog", "/vendorId") { DefaultTimeToLive = -1 });
        // The same container, with the same partition key, that catalog-service creates for customers' saved allergen profiles (its Program.cs).
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("preferences", "/customerId"));

        // The same container, with the same partition key, that ordering-service creates for customers' saved payment methods (its Program.cs; WI-ORD-010).
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("payment-methods", "/customerId"));

        var redis = await ConnectionMultiplexer.ConnectAsync(config["Redis:ConnectionString"] ?? "localhost:6379");
        var seeder = new Seeder(
            new CosmosRepository<ListingDocument>(cosmos, database, "catalog"),
            new RedisStreamsEventTransport(redis),
            new CosmosRepository<PreferenceProfileDocument>(cosmos, database, "preferences"));

        var result = await seeder.SeedAsync();
        var (methodsCreated, methodsUnchanged) =
            await new PaymentMethodSeeder(new CosmosRepository<OrderingService.Persistence.PaymentMethodDocument>(cosmos, database, "payment-methods")).SeedAsync();
        Console.WriteLine($"Payment methods created: {methodsCreated}, already present: {methodsUnchanged}.");
        Console.WriteLine($"Listings created: {result.ListingsCreated}, already present: {result.ListingsUnchanged}; VendorVerified events published: {result.VendorEventsPublished}; customer profiles created: {result.ProfilesCreated}, already present: {result.ProfilesUnchanged}.");
        Console.WriteLine("Start catalog-service afterwards (or leave it running): it applies VendorVerified from the stream, after which GET /catalog/listings returns the published listings.");
        return 0;
    }
}
