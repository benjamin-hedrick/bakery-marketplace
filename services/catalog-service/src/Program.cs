using BakeryMarketplace.Auth;
using BakeryMarketplace.Caching;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Logging;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Preferences;
using CatalogService.Services;
using CatalogService.Tags;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Azure.Cosmos;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Tracing (ADR-0016, WI-PORT-005): exports over OTLP only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
builder.Services.AddBakeryTelemetry(builder.Configuration, "catalog-service");

// Auth (ADR-0006): JWT bearer + role policies from the shared library; Authority/Audience come from config, so the
// local mock issuer and Entra External ID are a config swap. Plain-HTTP metadata is allowed only in Development.
builder.Services.AddBakeryAuth(builder.Configuration, requireHttpsMetadata: !builder.Environment.IsDevelopment());
builder.Services.AddSingleton<IAuthorizationHandler, ListingOwnershipHandler>();

// Data (ADR-0004). "fake" is the in-memory default for local dev and tests; "cosmos" uses the shared Cosmos adapter
// (exercised against the local emulator from docker-compose.yml; needs Cosmos SDK 3.63.x+). Listings and vendor status share the `catalog`
// container and are separated by partition: listings by vendorId, vendor status in one reserved partition.
if (string.Equals(builder.Configuration["Data:Backend"], "cosmos", StringComparison.OrdinalIgnoreCase))
{
    // The local emulator only works over the gateway; deployed environments keep the SDK default (direct mode).
    var cosmosOptions = new CosmosClientOptions();
    if (builder.Configuration.GetValue<bool>("Cosmos:GatewayMode"))
    {
        cosmosOptions.ConnectionMode = ConnectionMode.Gateway;
        cosmosOptions.LimitToEndpoint = true;
    }
    var cosmos = new CosmosClient(
        builder.Configuration["Cosmos:ConnectionString"]
            ?? throw new InvalidOperationException("Cosmos:ConnectionString is required when Data:Backend=cosmos."),
        cosmosOptions);
    var database = builder.Configuration["Cosmos:Database"] ?? "bakery";

    // Local-development convenience only (enabled in appsettings.Development.json). Deployed environments get their
    // database and containers from Terraform (DATA-004), so this stays off there.
    if (builder.Configuration.GetValue<bool>("Cosmos:EnsureCreated"))
    {
        var db = (await cosmos.CreateDatabaseIfNotExistsAsync(database)).Database;
        // DefaultTimeToLive -1: nothing expires unless it carries its own ttl, which only released stock reservations do (register item 66).
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("catalog", "/vendorId") { DefaultTimeToLive = -1 });
        // Customers' allergen profiles (WI-PREF-001): their own container, one partition per customer (ADR-0004).
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("preferences", "/customerId"));
    }

    builder.Services.AddSingleton<IRepository<ListingDocument>>(new CosmosRepository<ListingDocument>(cosmos, database, "catalog"));
    builder.Services.AddSingleton<IRepository<VendorStatusDocument>>(new CosmosRepository<VendorStatusDocument>(cosmos, database, "catalog"));
    // Stock reservations (ADR-0017): same container and partition as the listings they change, so one transactional batch covers both.
    builder.Services.AddSingleton<IRepository<StockReservationDocument>>(new CosmosRepository<StockReservationDocument>(cosmos, database, "catalog"));
    builder.Services.AddSingleton<IBatchFactory>(new CosmosBatchFactory(cosmos, database, "catalog"));
    builder.Services.AddSingleton<IRepository<PreferenceProfileDocument>>(new CosmosRepository<PreferenceProfileDocument>(cosmos, database, "preferences"));
}
else
{
    // Listings and reservations share one FakeDatabase so a batch can span both, like the single Cosmos container.
    var fakeCatalog = new FakeDatabase();
    builder.Services.AddSingleton<IRepository<ListingDocument>>(new FakeRepository<ListingDocument>(d => d.Id, fakeCatalog));
    builder.Services.AddSingleton<IRepository<StockReservationDocument>>(new FakeRepository<StockReservationDocument>(d => d.Id, fakeCatalog));
    builder.Services.AddSingleton<IBatchFactory>(new FakeBatchFactory(fakeCatalog));
    builder.Services.AddSingleton<IRepository<VendorStatusDocument>>(new FakeRepository<VendorStatusDocument>(d => d.Id));
    builder.Services.AddSingleton<IRepository<PreferenceProfileDocument>>(new FakeRepository<PreferenceProfileDocument>(d => d.Id));
}

// Events (ADR-0003). The backend must be chosen explicitly: "redis" (Redis Streams) or "inmemory" (tests and throwaway runs). There is no
// default, because silently falling back to in-memory would drop every event while looking healthy.
var eventsBackend = builder.Configuration["Events:Backend"];
if (string.Equals(eventsBackend, "redis", StringComparison.OrdinalIgnoreCase))
{
    var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    var transport = new RedisStreamsEventTransport(redis, maxStreamLength: builder.Configuration.GetValue<int?>("Events:MaxStreamLength"), serviceName: "catalog-service");
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
}
else if (string.Equals(eventsBackend, "inmemory", StringComparison.OrdinalIgnoreCase))
{
    var transport = new InMemoryEventTransport();
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
}
else
{
    throw new InvalidOperationException("Events:Backend must be set to 'redis' or 'inmemory'. There is no default, so events are never lost silently.");
}

builder.Services.AddSingleton(TimeProvider.System);
// The tag registry (ADR-0022) is data shipped with the service; a bad file stops the start here, naming the entry.
builder.Services.AddSingleton<ITagRegistry>(TagRegistry.LoadEmbedded());
// The caps on tags per listing and per option (WI-TAG-002): one setting (the Tags section), so they are easy to change (ADR-0022, 2026-11-04).
builder.Services.Configure<TagOptions>(builder.Configuration.GetSection("Tags"));
builder.Services.AddSingleton(sp => sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<TagOptions>>().Value);
builder.Services.AddSingleton<TagProjector>(); // which tags a response may show (public: active today; owner: all they assigned, marked)
// The listing cache (ADR-0002, ADR-0014 layer 1, WI-CAT-003). Cache:Backend is "local" (in-process, the default, no dependency) or "redis" (the cache
// Redis, ResilientCacheProvider in front of it: an outage falls back to the local provider). ListingCache:TtlSeconds, 60 by default, 0 turns it off.
builder.Services.Configure<ListingCacheOptions>(builder.Configuration.GetSection("ListingCache"));
builder.Services.AddLocalCacheProvider();
var cacheBackend = builder.Configuration["Cache:Backend"] ?? "local";
if (string.Equals(cacheBackend, "redis", StringComparison.OrdinalIgnoreCase))
{
    // abortConnect=false: the service starts and the resilient provider serves from the local fallback if the cache Redis is not up yet.
    var cacheRedis = builder.Configuration["Cache:Redis:ConnectionString"] ?? "localhost:6380";
    if (!cacheRedis.Contains("abortConnect", StringComparison.OrdinalIgnoreCase)) cacheRedis += ",abortConnect=false";
    builder.Services.AddRedisCacheProvider(cacheRedis);
    builder.Services.AddResilientCacheProvider();
    builder.Services.AddSingleton(sp => new ListingCache(
        sp.GetRequiredService<ResilientCacheProvider>(),
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<ListingCacheOptions>>(),
        sp.GetRequiredService<ILogger<ListingCache>>()));
}
else if (string.Equals(cacheBackend, "local", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddSingleton(sp => new ListingCache(
        sp.GetRequiredService<LocalCacheProvider>(),
        sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<ListingCacheOptions>>(),
        sp.GetRequiredService<ILogger<ListingCache>>()));
}
else
{
    throw new InvalidOperationException("Cache:Backend must be 'local' or 'redis'.");
}
builder.Services.AddSingleton<VendorStatusStore>();
builder.Services.Configure<CatalogOutboxOptions>(builder.Configuration.GetSection("Outbox"));
builder.Services.AddSingleton<ListingEventPublisher>();
builder.Services.AddHostedService<ListingOutboxRelay>();
builder.Services.AddSingleton<ListingService>();
builder.Services.AddSingleton<PreferenceService>();
builder.Services.AddSingleton<IPreferenceReader>(sp => sp.GetRequiredService<PreferenceService>());
builder.Services.AddSingleton<StockReservationService>();
builder.Services.AddHostedService<VendorEventSubscriptions>();

var app = builder.Build();

app.UseCorrelationId();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
app.MapTagEndpoints();
app.MapPreferenceEndpoints();
app.MapPersonalizedListingEndpoints();
app.MapListingEndpoints();
app.MapStockReservationEndpoints();

app.Run();

/// <summary>Exposed so integration tests can host the service with WebApplicationFactory.</summary>
public partial class Program;
