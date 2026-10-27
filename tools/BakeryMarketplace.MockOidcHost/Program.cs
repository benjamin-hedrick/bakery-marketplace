using BakeryMarketplace.Auth;

// Runnable host for the local mock OIDC issuer (WI-AUTH-005 delivered the endpoints as a library extension only).
// It signs tokens for anyone who asks, so it must never run outside a developer machine or test environment.
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

if (app.Environment.IsProduction())
{
    throw new InvalidOperationException(
        "The mock OIDC issuer refuses to start in the Production environment. " +
        "Set ASPNETCORE_ENVIRONMENT=Development for local use; never deploy this host.");
}

app.MapGet("/healthz", () => Results.Ok(new { status = "Healthy" }));
app.MapMockOidcIssuer(builder.Configuration["Auth:Audience"] ?? "bakery-marketplace");

app.Run();
