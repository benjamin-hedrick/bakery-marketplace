// Local-dev seed (WI-DEV-004). Run after `docker compose up` (node scripts/dev/check-env.mjs --wait 90):
//
//   Cosmos__ConnectionString="AccountEndpoint=http://localhost:8081/;AccountKey=<emulator key>" dotnet run --project tools/BakeryMarketplace.Seed
//
// Settings use the same names as catalog-service so one env file serves both. Redis__ConnectionString defaults to
// localhost:6379; Cosmos__Database to "bakery". Refuses any Cosmos endpoint but a loopback one, except the deployed dev environment's when its seed job
// sets Seed__AllowDeployedDev=true and Deployment__Environment=dev (SeedTarget; register 224). There it creates nothing: the containers are the dev stack's.
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

        var target = SeedTarget.Decide(cosmosConnection, config[SeedTarget.AllowDeployedDevSetting], config[SeedTarget.DeploymentEnvironmentSetting]);
        if (!target.Allowed)
        {
            Console.Error.WriteLine($"Refusing to seed: {target.Reason}");
            return 2;
        }
        var deployed = target.Kind == SeedTargetKind.DeployedDev;
        var redisConnection = config["Redis:ConnectionString"];
        if (deployed && string.IsNullOrWhiteSpace(redisConnection))
        {
            // Locally the events Redis is on localhost; in the deployed environment there is no such default (the dev stack names it).
            Console.Error.WriteLine("Redis__ConnectionString is required when seeding the deployed dev environment.");
            return 2;
        }
        Console.WriteLine(deployed ? "Seeding the deployed dev environment." : "Seeding the local emulator.");

        var database = config["Cosmos:Database"] ?? "bakery";
        var cosmos = CosmosClientFactory.Create(cosmosConnection, gatewayMode: true); // the emulator only works over the gateway; https only, for the deployed account too
        string[] containers = ["catalog", "preferences", "payment-methods"];
        if (deployed)
        {
            // The deployed database and containers are the dev stack's (infra/environments/dev, Terraform); the seed never creates or changes them there.
            foreach (var name in containers)
                await cosmos.GetContainer(database, name).ReadContainerAsync();
        }
        else
        {
            var db = (await cosmos.CreateDatabaseIfNotExistsAsync(database)).Database;
            await db.CreateContainerIfNotExistsAsync(new ContainerProperties("catalog", "/vendorId") { DefaultTimeToLive = -1 });
            // The same container, with the same partition key, that catalog-service creates for customers' saved allergen profiles (its Program.cs).
            await db.CreateContainerIfNotExistsAsync(new ContainerProperties("preferences", "/customerId"));

            // The same container, with the same partition key, that ordering-service creates for customers' saved payment methods (its Program.cs; WI-ORD-010).
            await db.CreateContainerIfNotExistsAsync(new ContainerProperties("payment-methods", "/customerId"));
        }

        var redis = await ConnectionMultiplexer.ConnectAsync(redisConnection ?? "localhost:6379");
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
