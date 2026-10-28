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
// Service clients for the client credentials grant (ADR-0018). Secrets come from configuration (MockOidc__Clients__<id>__Secret,
// generated into .env by scripts/dev/init-env.mjs); a client with no secret, or one that is too short, is skipped. Only client ids are logged.
var clients = new List<MockClient>();
foreach (var entry in builder.Configuration.GetSection("MockOidc:Clients").GetChildren())
{
    var secret = entry["Secret"] ?? "";
    if (secret.Length < MockClient.MinimumSecretLength)
    {
        app.Logger.LogWarning("Mock client '{ClientId}' not registered: no secret of at least {Min} characters configured.", entry.Key, MockClient.MinimumSecretLength);
        continue;
    }
    var client = new MockClient(entry.Key, secret, entry.GetSection("Roles").Get<string[]>() ?? [], entry["Audience"]);
    clients.Add(client);
    app.Logger.LogInformation("Mock client registered: {Client}", client);
}

app.MapMockOidcIssuer(builder.Configuration["Auth:Audience"] ?? "bakery-marketplace", clients);

app.Run();
