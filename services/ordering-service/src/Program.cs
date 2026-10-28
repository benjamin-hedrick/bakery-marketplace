using BakeryMarketplace.Auth;
using BakeryMarketplace.Data;
using BakeryMarketplace.Logging;
using BakeryMarketplace.Secrets;
using Microsoft.Azure.Cosmos;
using OrderingService.Api;
using OrderingService.Checkout;
using OrderingService.Persistence;

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
builder.Services.AddBakeryTelemetry(builder.Configuration, "ordering-service");

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
    }

    builder.Services.AddSingleton<IRepository<OrderDocument>>(new CosmosRepository<OrderDocument>(cosmos, database, "orders"));
}
else
{
    builder.Services.AddSingleton<IRepository<OrderDocument>>(new FakeRepository<OrderDocument>(d => d.Id));
}
builder.Services.AddSingleton<OrderStore>();

// Checkout (WI-ORD-001).
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.Configure<PickupScheduleOptions>(builder.Configuration.GetSection("Pickup"));
builder.Services.AddSingleton<PickupSchedule>();
builder.Services.AddSingleton<IPaymentProcessor, StubPaymentProcessor>(); // a stub until PAY-001: no money moves

// The catalog: public listing reads need no credentials; stock reserve and release authenticate as this service (ADR-0018). A missing or unsafe
// value stops the service at startup rather than at the first order.
SecretValidator.ValidateUriSecret(builder.Configuration, "Catalog:BaseUrl");
builder.Services.AddBakeryServiceAuth(builder.Configuration);
var catalogUrl = new Uri(builder.Configuration["Catalog:BaseUrl"]!);
var catalogTimeout = TimeSpan.FromSeconds(builder.Configuration.GetValue("Catalog:TimeoutSeconds", 5));
builder.Services.AddHttpClient(CatalogGateway.PublicClientName, c => { c.BaseAddress = catalogUrl; c.Timeout = catalogTimeout; });
builder.Services.AddHttpClient(CatalogGateway.ServiceClientName, c => { c.BaseAddress = catalogUrl; c.Timeout = catalogTimeout; }).AddServiceAuthHandler();
builder.Services.AddSingleton<ICatalogGateway, CatalogGateway>();
builder.Services.AddSingleton<CheckoutService>();

var app = builder.Build();

app.UseCorrelationId();
app.UseCors("AllowFrontendOrigin");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));
app.MapCheckoutEndpoints();

app.Run();

/// <summary>Exposed so integration tests can host the service with WebApplicationFactory.</summary>
public partial class Program;
