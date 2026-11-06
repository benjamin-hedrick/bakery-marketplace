using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using OrderingService.Checkout;

namespace OrderingService.Tests;

/// <summary>
/// Hosts the real ordering-service in-process with the real shared JWT middleware and the real <see cref="CatalogGateway"/> and service-token
/// handler, pointed at a <see cref="FakeCatalogServer"/>. Only the signing key source and the clock differ from production: user tokens are
/// signed with a test key supplied as static OIDC configuration, and "now" is pinned so pickup windows are deterministic.
/// </summary>
internal sealed class OrderingFactory : WebApplicationFactory<Program>
{
    public const string Issuer = "https://issuer.test";
    public const string Audience = "bakery-marketplace";

    private static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "test-key" };

    private readonly FakeCatalogServer _catalog;
    private readonly string _environment;
    private readonly string _clientSecret;

    public ManualTime Time { get; } = new(Seed.Now);

    /// <summary>The host's payment methods: every test customer has the two test methods (see <see cref="TestPaymentMethodRepository"/>).</summary>
    public TestPaymentMethodRepository MethodRepository { get; } = new();

    private readonly IReadOnlyDictionary<string, string> _extraSettings;
    private readonly Microsoft.Extensions.Logging.ILoggerProvider? _logs;

    public OrderingFactory(
        FakeCatalogServer catalog, string clientSecret, string environment = "Development",
        IReadOnlyDictionary<string, string>? extraSettings = null, Microsoft.Extensions.Logging.ILoggerProvider? logs = null,
        Action<IServiceCollection>? configureServices = null)
    {
        _catalog = catalog;
        _clientSecret = clientSecret;
        _environment = environment;
        _extraSettings = extraSettings ?? new Dictionary<string, string>();
        _logs = logs;
        _configureServices = configureServices;
    }

    private readonly Action<IServiceCollection>? _configureServices;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);
        // UseSetting, not ConfigureAppConfiguration: with minimal hosting Program.cs reads configuration before the host is built, and only
        // host settings are visible that early.
        foreach (var (key, value) in new Dictionary<string, string>
        {
            ["Auth:Authority"] = Issuer,
            ["Auth:Audience"] = Audience,
            ["Catalog:BaseUrl"] = _catalog.Url,
            ["ServiceAuth:TokenEndpoint"] = _catalog.Url + "/token",
            ["ServiceAuth:ClientId"] = FakeCatalogServer.ClientId,
            ["ServiceAuth:Scope"] = "bakery-marketplace/.default",
            ["ServiceAuth:ClientSecret"] = _clientSecret,
            ["Events:Backend"] = "inmemory",
            ["ListingNames:RefreshEnabled"] = "false", // tests drive the refresh themselves
            ["OrphanReservations:Enabled"] = "false", // the sweep is driven directly in its own tests
            ["Outbox:RelayEnabled"] = "false", // tests drive sweeps themselves; a background loop would make them timing-dependent
        })
        {
            builder.UseSetting(key, value);
        }

        foreach (var (key, value) in _extraSettings) builder.UseSetting(key, value);

        builder.ConfigureServices(services =>
        {
            if (_logs is not null) services.AddSingleton(_logs);
            _configureServices?.Invoke(services);
            services.RemoveAll<BakeryMarketplace.Data.IRepository<OrderingService.Persistence.PaymentMethodDocument>>();
            services.AddSingleton<BakeryMarketplace.Data.IRepository<OrderingService.Persistence.PaymentMethodDocument>>(MethodRepository);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.Configuration = new OpenIdConnectConfiguration { Issuer = Issuer };
                options.TokenValidationParameters.IssuerSigningKey = SigningKey;
            });
        });
    }

    public string Token(string sub, params string[] roles) => TokenFor(TimeSpan.FromMinutes(10), sub, roles);

    /// <summary>A token that expires after <paramref name="lifetime"/> (for the streams, which end when their token does).</summary>
    public string TokenFor(TimeSpan lifetime, string sub, params string[] roles)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            NotBefore = DateTime.UtcNow.AddMinutes(-30),
            Expires = DateTime.UtcNow.Add(lifetime),
            Subject = new ClaimsIdentity([new Claim("sub", sub), .. roles.Select(r => new Claim("roles", r))]),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.RsaSha256),
        };
        return new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false }.WriteToken(new JwtSecurityTokenHandler().CreateToken(descriptor));
    }

    public HttpClient CustomerClient(string customerId = "customer-1")
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(customerId, "Customer"));
        return client;
    }

    public HttpClient ClientWithToken(string token)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    public HttpClient ClientWithRole(string sub, string role)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(sub, role));
        return client;
    }

    public static Task<HttpResponseMessage> PostCheckout(
        HttpClient client, object? body, string? key = null, bool noKey = false)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/ordering/checkout") { Content = JsonContent.Create(body) };
        if (!noKey) request.Headers.Add("Idempotency-Key", key ?? Seed.NewKey());
        return client.SendAsync(request);
    }
}
