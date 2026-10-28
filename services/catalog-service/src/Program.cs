using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Logging;
using CatalogService.Api;
using CatalogService.Domain;
using CatalogService.Services;
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
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("catalog", "/vendorId"));
    }

    builder.Services.AddSingleton<IRepository<ListingDocument>>(new CosmosRepository<ListingDocument>(cosmos, database, "catalog"));
    builder.Services.AddSingleton<IRepository<VendorStatusDocument>>(new CosmosRepository<VendorStatusDocument>(cosmos, database, "catalog"));
}
else
{
    builder.Services.AddSingleton<IRepository<ListingDocument>>(new FakeRepository<ListingDocument>(d => d.Id));
    builder.Services.AddSingleton<IRepository<VendorStatusDocument>>(new FakeRepository<VendorStatusDocument>(d => d.Id));
}

// Events (ADR-0003). "inmemory" is the local default; "redis" uses Redis Streams.
if (string.Equals(builder.Configuration["Events:Backend"], "redis", StringComparison.OrdinalIgnoreCase))
{
    var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    var transport = new RedisStreamsEventTransport(redis);
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
}
else
{
    var transport = new InMemoryEventTransport();
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
}

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<VendorStatusStore>();
builder.Services.AddSingleton<ListingService>();
builder.Services.AddHostedService<VendorEventSubscriptions>();

var app = builder.Build();

app.UseCorrelationId();
app.UseCors("AllowFrontendOrigin");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
app.MapListingEndpoints();

app.Run();

/// <summary>Exposed so integration tests can host the service with WebApplicationFactory.</summary>
public partial class Program;
