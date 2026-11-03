using BakeryMarketplace.Caching;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.Logging;
using NotificationService.Contacts;
using NotificationService.Processing;
using NotificationService.Sending;
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

// Events (ADR-0003). As in ordering, the backend must be chosen explicitly: "redis" (Redis Streams) or "inmemory". The consumer group is
// named for this service, so it receives every order event independently of the vendor queue (register item 29). Events:MaxStreamLength
// trims the streams; with this consumer's backlog far below it, a limit is safe (register item 75).
var eventsBackend = builder.Configuration["Events:Backend"];
IConnectionMultiplexer? redis = null;
if (string.Equals(eventsBackend, "redis", StringComparison.OrdinalIgnoreCase))
{
    redis = ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    var transport = new RedisStreamsEventTransport(
        redis, maxStreamLength: builder.Configuration.GetValue<int?>("Events:MaxStreamLength"), serviceName: "notification-service");
    builder.Services.AddSingleton<IEventSubscriber>(transport);
}
else if (string.Equals(eventsBackend, "inmemory", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddSingleton<IEventSubscriber>(new InMemoryEventTransport());
}
else
{
    throw new InvalidOperationException("Events:Backend must be set to 'redis' or 'inmemory'. There is no default, so events are never lost silently.");
}

// Cache (ADR-0002): in process unless Cache:Backend is "redis", then Redis with the in-process cache as the fallback when it is down.
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<LocalCacheProvider>();
if (string.Equals(builder.Configuration["Cache:Backend"], "redis", StringComparison.OrdinalIgnoreCase))
{
    var cacheRedis = redis ?? ConnectionMultiplexer.Connect(builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379");
    builder.Services.AddSingleton<ICacheProvider>(sp => new ResilientCacheProvider(
        new RedisCacheProvider(cacheRedis), sp.GetRequiredService<LocalCacheProvider>(),
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
builder.Services.AddSingleton<IMessageComposer, PlainMessageComposer>();
builder.Services.AddSingleton(sp => new SentLedger(sp.GetRequiredService<ICacheProvider>()));
builder.Services.AddSingleton<OrderEventNotifier>();
builder.Services.AddHostedService<OrderEventSubscriptions>();

var app = builder.Build();

app.UseCorrelationId();
app.UseCors("AllowFrontendOrigin");

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));

app.Run();

public partial class Program;
