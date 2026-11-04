using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Logging;
using BakeryMarketplace.Secrets;
using Microsoft.Azure.Cosmos;
using OrderingService.Api;
using OrderingService.Checkout;
using OrderingService.Orders;
using OrderingService.Outbox;
using OrderingService.Persistence;
using OrderingService.Streaming;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

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

// Tracing (ADR-0016): exports over OTLP only when OTEL_EXPORTER_OTLP_ENDPOINT is set.
builder.Services.AddBakeryTelemetry(builder.Configuration, "ordering-service", VendorOrderStreamHub.MeterName);

// Auth (ADR-0006): customers call this service with their own token; Authority and Audience come from config.
builder.Services.AddBakeryAuth(builder.Configuration, requireHttpsMetadata: !builder.Environment.IsDevelopment());

// Data (ADR-0004). "fake" is the in-memory default for local development and tests; "cosmos" stores orders in the `orders` container,
// partitioned by customer. Creating the database and container here is a local convenience only (deployed environments use Terraform).
if (string.Equals(builder.Configuration["Data:Backend"], "cosmos", StringComparison.OrdinalIgnoreCase))
{
    var cosmosOptions = new CosmosClientOptions();
    if (builder.Configuration.GetValue<bool>("Cosmos:GatewayMode"))
    {
        cosmosOptions.ConnectionMode = ConnectionMode.Gateway; // the local emulator only works over the gateway
        cosmosOptions.LimitToEndpoint = true;
    }
    var cosmos = new CosmosClient(
        builder.Configuration["Cosmos:ConnectionString"]
            ?? throw new InvalidOperationException("Cosmos:ConnectionString is required when Data:Backend=cosmos."),
        cosmosOptions);
    var database = builder.Configuration["Cosmos:Database"] ?? "bakery";

    if (builder.Configuration.GetValue<bool>("Cosmos:EnsureCreated"))
    {
        var db = (await cosmos.CreateDatabaseIfNotExistsAsync(database)).Database;
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("orders", "/customerId"));
        await db.CreateContainerIfNotExistsAsync(new ContainerProperties("vendor-orders", "/vendorId")); // the vendor read model (N-03)
    }

    builder.Services.AddSingleton<IRepository<OrderDocument>>(new CosmosRepository<OrderDocument>(cosmos, database, "orders"));
    builder.Services.AddSingleton<IRepository<VendorOrderDocument>>(new CosmosRepository<VendorOrderDocument>(cosmos, database, "vendor-orders"));
}
else
{
    builder.Services.AddSingleton<IRepository<OrderDocument>>(new FakeRepository<OrderDocument>(d => d.Id));
    builder.Services.AddSingleton<IRepository<VendorOrderDocument>>(new FakeRepository<VendorOrderDocument>(d => d.Id));
}
builder.Services.AddSingleton<OrderStore>();
builder.Services.AddSingleton<VendorOrderProjection>();
builder.Services.AddSingleton<VendorOrderReader>();

// Events (ADR-0003, WI-ORD-005). The backend must be chosen explicitly: "redis" (Redis Streams) or "inmemory" (tests and throwaway runs).
// There is no default, because silently falling back to in-memory would drop every order event while looking healthy.
var eventsBackend = builder.Configuration["Events:Backend"];
if (string.Equals(eventsBackend, "redis", StringComparison.OrdinalIgnoreCase))
{
    var redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    var transport = new RedisStreamsEventTransport(
        redis, maxStreamLength: builder.Configuration.GetValue<int?>("Events:MaxStreamLength"), serviceName: "ordering-service");
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
    var broadcast = new RedisBroadcast(redis); // Pub/Sub on the same connection, for the live vendor streams (ADR-0021)
    builder.Services.AddSingleton<IBroadcastPublisher>(broadcast);
    builder.Services.AddSingleton<IBroadcastSubscriber>(broadcast);
}
else if (string.Equals(eventsBackend, "inmemory", StringComparison.OrdinalIgnoreCase))
{
    var transport = new InMemoryEventTransport();
    builder.Services.AddSingleton<IEventPublisher>(transport);
    builder.Services.AddSingleton<IEventSubscriber>(transport);
    var broadcast = new InMemoryBroadcast();
    builder.Services.AddSingleton<IBroadcastPublisher>(broadcast);
    builder.Services.AddSingleton<IBroadcastSubscriber>(broadcast);
}
else
{
    throw new InvalidOperationException("Events:Backend must be set to 'redis' or 'inmemory'. There is no default, so events are never lost silently.");
}
builder.Services.Configure<OutboxOptions>(builder.Configuration.GetSection("Outbox"));
builder.Services.AddSingleton<OutboxSignal>();
builder.Services.AddSingleton<OrderEventPublisher>();
builder.Services.AddHostedService<OutboxRelay>();
builder.Services.Configure<VendorStreamOptions>(builder.Configuration.GetSection("VendorStream"));
builder.Services.AddSingleton<VendorOrderStreamHub>();
builder.Services.AddHostedService<VendorOrderSubscriptions>(); // the vendor order read model, fed by the order events (N-03)

// Checkout (WI-ORD-001).
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<PickupScheduleOptions>(builder.Configuration.GetSection("Pickup"));
builder.Services.AddSingleton<PickupSchedule>();
builder.Services.Configure<CheckoutOptions>(builder.Configuration.GetSection("Checkout"));
builder.Services.AddSingleton<IPaymentProcessor, StubPaymentProcessor>(); // a stub until PAY-001: no money moves

// The catalog: public listing reads need no credentials; stock reserve and release authenticate as this service (ADR-0018). A missing or unsafe
// value stops the service at startup rather than at the first order.
SecretValidator.ValidateUriSecret(builder.Configuration, "Catalog:BaseUrl");
// Development only may send the client secret to a plain-http issuer that is not loopback: the issuer is another container on the Compose network.
builder.Services.AddBakeryServiceAuth(builder.Configuration, allowInsecureTokenEndpoint: builder.Environment.IsDevelopment());
var catalogUrl = new Uri(builder.Configuration["Catalog:BaseUrl"]!);
var catalogTimeout = TimeSpan.FromSeconds(builder.Configuration.GetValue("Catalog:TimeoutSeconds", 5));
builder.Services.AddHttpClient(CatalogGateway.PublicClientName, c => { c.BaseAddress = catalogUrl; c.Timeout = catalogTimeout; });
builder.Services.AddHttpClient(CatalogGateway.ServiceClientName, c => { c.BaseAddress = catalogUrl; c.Timeout = catalogTimeout; }).AddServiceAuthHandler();
builder.Services.AddSingleton<ICatalogGateway, CatalogGateway>();
builder.Services.Configure<ListingNameOptions>(builder.Configuration.GetSection("ListingNames"));
builder.Services.Configure<AllergenRegistryOptions>(builder.Configuration.GetSection("Allergens"));
builder.Services.AddSingleton<AllergenRegistry>(); // the allergen ids checkout accepts, from the catalog's registry (WI-ORD-009)
builder.Services.AddSingleton<ListingNameCache>(); // names behind the ids in the vendor order view (register item 113)
builder.Services.AddHostedService<ListingNameRefresher>();
builder.Services.Configure<OrphanReservationOptions>(builder.Configuration.GetSection("OrphanReservations"));
builder.Services.AddHostedService<OrphanReservationSweeper>(); // register item 62
builder.Services.AddSingleton<CheckoutService>();
builder.Services.AddSingleton<OrderActionService>(); // WI-ORD-007

var app = builder.Build();

app.UseCorrelationId();
app.UseCors("AllowFrontendOrigin");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
app.MapPickupWindowEndpoints();
app.MapCheckoutEndpoints();
app.MapOrderActionEndpoints();
app.MapVendorOrderEndpoints();
app.MapVendorOrderStreamEndpoint();

app.Run();

/// <summary>Exposed so integration tests can host the service with WebApplicationFactory.</summary>
public partial class Program;
