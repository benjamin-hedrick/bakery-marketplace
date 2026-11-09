using BakeryMarketplace.Caching;
using BakeryMarketplace.Chaos;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Logging;
using NotificationService.Contacts;
using NotificationService.Processing;
using NotificationService.Sending;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Traces (ADR-0016): exported only when OTEL_EXPORTER_OTLP_ENDPOINT is set; includes the batch consumer spans of the event transport.
builder.Services.AddBakeryTelemetry(builder.Configuration, "notification-service");

// Events (ADR-0003). As in ordering, the backend must be chosen explicitly: "redis" (Redis Streams) or "inmemory". The consumer group is
// named for this service, so it receives every order event independently of the vendor queue (register item 29). Events:MaxStreamLength
// trims the streams; with this consumer's backlog far below it, a limit is safe (register item 75).
var redis = builder.Services.AddBakeryEvents(builder.Configuration, "notification-service");

// Cache (ADR-0002): in process unless Cache:Backend is "redis", then Redis with the in-process cache as the fallback when it is down.
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<LocalCacheProvider>();
if (string.Equals(builder.Configuration["Cache:Backend"], "redis", StringComparison.OrdinalIgnoreCase))
{
    var cacheRedis = redis ?? ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    // The cache chaos layer goes under the resilient provider: Resilient(Chaos(Redis)) (ADR-0024).
    builder.Services.AddSingleton<ICacheProvider>(sp => new ResilientCacheProvider(
        sp.WrapCachePrimary(new RedisCacheProvider(cacheRedis)), sp.GetRequiredService<LocalCacheProvider>(),
        new PollyCircuitBreakerPolicy(3, TimeSpan.FromSeconds(30)), sp.GetRequiredService<ILogger<ResilientCacheProvider>>()));
}
else
{
    builder.Services.AddSingleton<ICacheProvider>(sp => sp.GetRequiredService<LocalCacheProvider>());
}

// Contacts: seeded from the mock identity's customers behind a cache; delivery: the log sender (no real provider is built).
builder.Services.AddSingleton<IContactDirectory>(sp => new CachedContactDirectory(
    SeededContactDirectory.FromMockIdentity(), sp.GetRequiredService<ICacheProvider>(), sp.GetRequiredService<ILogger<CachedContactDirectory>>()));
builder.Services.AddSingleton<INotificationSender, LogNotificationSender>();
builder.Services.AddSingleton<IMessageComposer, TemplateMessageComposer>();
builder.Services.AddSingleton(sp => new SentLedger(sp.GetRequiredService<ICacheProvider>()));
builder.Services.AddSingleton<OrderEventNotifier>();
builder.Services.AddHostedService<OrderEventSubscriptions>();

// Chaos scenarios (ADR-0024): does nothing unless Chaos:Enabled is set, and then only in Development or the dev deployment.
builder.Services.AddBakeryChaos(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseCorrelationId();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));

app.Run();

public partial class Program;
