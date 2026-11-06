using BakeryMarketplace.Auth;

// Runnable host for the local mock OIDC issuer (WI-AUTH-005 delivered the endpoints as a library extension only).
// It signs tokens for anyone who asks, so it runs outside a developer machine only as MockOidcDeployment allows (a disposable dev environment).
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Refuses Production unless the deployed-dev switch is set on safe terms (https issuer, Customer-only logins unless the ingress is
// IP-restricted); see MockOidcDeployment and register item 102. Null = every mock user (local use, unchanged).
var allowedRoles = MockOidcDeployment.Resolve(builder.Configuration, app.Environment.IsProduction());
if (app.Environment.IsProduction())
    LoggerMessages.LogMockOIDCIssuerRunningInA(app.Logger, string.Join(", ", allowedRoles ?? []));

app.MapGet("/healthz", () => Results.Ok(new { status = "Healthy" }));
// Service clients for the client credentials grant (ADR-0018). Secrets come from configuration (MockOidc__Clients__<id>__Secret,
// generated into .env by scripts/dev/init-env.mjs); a client with no secret, or one that is too short, is skipped. Only client ids are logged.
var clients = new List<MockClient>();
foreach (var entry in builder.Configuration.GetSection("MockOidc:Clients").GetChildren())
{
    var secret = entry["Secret"] ?? "";
    if (secret.Length < MockClient.MinimumSecretLength)
    {
        LoggerMessages.LogMockClientNotRegisteredNoSecret(app.Logger, entry.Key, MockClient.MinimumSecretLength);
        continue;
    }
    var client = new MockClient(entry.Key, secret, entry.GetSection("Roles").Get<string[]>() ?? [], entry["Audience"]);
    clients.Add(client);
    LoggerMessages.LogMockClientRegistered(app.Logger, client);
}

// The browser app exchanges its authorization code here directly, so the web app's origin(s) may call this issuer cross-origin. Exact origins
// only (MockOidc__AllowedOrigins__0, __1, ...); the default is the local Next.js dev/start port.
app.UseMockOidcBrowserCors(builder.Configuration.GetSection("MockOidc:AllowedOrigins").Get<string[]>() is { Length: > 0 } configured
    ? configured
    : MockOidcCors.DefaultOrigins);

// Logins may only send a browser back to a registered redirect_uri, compared exactly (MockOidc__RedirectUris__0, __1, ...); the default is the
// local web app's callback. This also stops the issuer being used to bounce someone to another site.
var redirectUris = builder.Configuration.GetSection("MockOidc:RedirectUris").Get<string[]>() is { Length: > 0 } registered
    ? registered
    : MockOidcIssuer.DefaultRedirectUris;

// MockOidc__Issuer fixes the issuer string (the address the browser uses), so services that reach this host by its container name still see one issuer.
var issuer = builder.Configuration["MockOidc:Issuer"];
// MockOidc__RefreshTokenMinutes sets how long a refresh token lives (each use renews it); the default is 8 hours (ADR-0019).
var refreshMinutes = builder.Configuration.GetValue<int?>("MockOidc:RefreshTokenMinutes");
app.MapMockOidcIssuer(
    builder.Configuration["Auth:Audience"] ?? "bakery-marketplace", clients, redirectUris, string.IsNullOrWhiteSpace(issuer) ? null : issuer, allowedRoles,
    refreshMinutes is > 0 ? TimeSpan.FromMinutes(refreshMinutes.Value) : null);

app.Run();

internal static partial class LoggerMessages
{
    [LoggerMessage(Level = LogLevel.Warning, Message = "Mock OIDC issuer running in a DEPLOYED environment; logins limited to roles: {Roles}.")]
    internal static partial void LogMockOIDCIssuerRunningInA(ILogger logger, string roles);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Mock client '{ClientId}' not registered: no secret of at least {Min} characters configured.")]
    internal static partial void LogMockClientNotRegisteredNoSecret(ILogger logger, string clientId, int min);

    [LoggerMessage(Level = LogLevel.Information, Message = "Mock client registered: {Client}")]
    internal static partial void LogMockClientRegistered(ILogger logger, BakeryMarketplace.Auth.MockClient client);
}
