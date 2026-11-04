using BakeryMarketplace.Auth;
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

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontendOrigin", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

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
app.UseCors("AllowFrontendOrigin");
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
