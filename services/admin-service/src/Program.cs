using BakeryMarketplace.Logging;

var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.UseCorrelationId();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));

app.Run();
