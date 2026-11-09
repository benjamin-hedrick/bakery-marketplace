using BakeryMarketplace.Chaos;
using BakeryMarketplace.Logging;

var builder = WebApplication.CreateBuilder(args);

// Chaos scenarios (ADR-0024): does nothing unless Chaos:Enabled is set, and then only in Development or the dev deployment.
builder.Services.AddBakeryChaos(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseCorrelationId();

app.MapGet("/health", () => Results.Ok(new { status = "Healthy" }));

app.Run();
