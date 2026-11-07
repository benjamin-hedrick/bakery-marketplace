using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using BakeryMarketplace.Data;
using BakeryMarketplace.Eventing;
using BakeryMarketplace.EventSchemas;
using CatalogService.Domain;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace CatalogService.Tests;

/// <summary>
/// Hosts the real catalog-service in-process with the real shared JWT middleware (<c>AddBakeryAuth</c>). Only the
/// signing key source differs from production: tokens are signed with a test key supplied as static OIDC
/// configuration, so issuer, audience, lifetime and signature are all genuinely validated and no mock server is needed.
/// Data and events use the in-memory defaults.
/// </summary>
public sealed class CatalogFactory : WebApplicationFactory<Program>
{
    public const string Issuer = "https://issuer.test";
    public const string Audience = "bakery-marketplace";

    private static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "test-key" };
    private static readonly RsaSecurityKey OtherKey = new(RSA.Create(2048)) { KeyId = "other-key" };

    /// <summary>Extra host settings for one test (for instance <c>Cache:Backend</c>), set before the first request builds the host.</summary>
    public Dictionary<string, string?> HostSettings { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Events:Backend", "inmemory"); // read by Program.cs before the host is built, so it must be a host setting
        foreach (var (key, value) in HostSettings) builder.UseSetting(key, value);
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Authority"] = Issuer,
            ["Auth:Audience"] = Audience,
        }));

        builder.ConfigureServices(services =>
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.Configuration = new OpenIdConnectConfiguration { Issuer = Issuer };
                options.TokenValidationParameters.IssuerSigningKey = SigningKey;
            }));
    }

    public string Token(string sub, string role, TimeSpan? lifetime = null, bool wrongKey = false, string audience = Audience)
    {
        var now = DateTime.UtcNow;
        var life = lifetime ?? TimeSpan.FromMinutes(10);
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = audience,
            NotBefore = now.AddMinutes(-30), // earlier than any test lifetime, so an "expired" token is expired, not premature
            Expires = now + life,
            Subject = new ClaimsIdentity(new[] { new Claim("sub", sub), new Claim("roles", role) }),
            SigningCredentials = new SigningCredentials(wrongKey ? OtherKey : SigningKey, SecurityAlgorithms.RsaSha256),
        };
        var handler = new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false };
        return handler.WriteToken(handler.CreateToken(descriptor));
    }

    /// <summary>An app-only token like the one a service gets from the client credentials grant (ADR-0018): client id, <c>idtyp=app</c>, app roles.</summary>
    public string ServiceToken(string clientId, string[] appRoles, bool appOnly = true)
    {
        var claims = new List<Claim> { new("sub", clientId), new("client_id", clientId) };
        if (appOnly) claims.Add(new Claim("idtyp", "app"));
        claims.AddRange(appRoles.Select(r => new Claim("roles", r)));
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Audience = Audience,
            NotBefore = DateTime.UtcNow.AddMinutes(-30),
            Expires = DateTime.UtcNow.AddMinutes(10),
            Subject = new ClaimsIdentity(claims),
            SigningCredentials = new SigningCredentials(SigningKey, SecurityAlgorithms.RsaSha256),
        };
        return new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false }.WriteToken(new JwtSecurityTokenHandler().CreateToken(descriptor));
    }

    public HttpClient ServiceClientFor(string clientId, params string[] appRoles)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ServiceToken(clientId, appRoles));
        return client;
    }

    public HttpClient ClientFor(string sub, string role)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token(sub, role));
        return client;
    }

    public IRepository<ListingDocument> Listings => Services.GetRequiredService<IRepository<ListingDocument>>();

    /// <summary>Publishes a VendorVerified event through the real transport and subscription path.</summary>
    public Task VerifyVendorAsync(string vendorId, long sequence = 1) =>
        Services.GetRequiredService<IEventPublisher>().PublishAsync(new DomainEventEnvelope<VendorVerifiedPayload>(
            Guid.NewGuid(), "VendorVerified", 1, DateTimeOffset.UtcNow, "Vendor", vendorId, sequence,
            new VendorVerifiedPayload(vendorId)));

    public Task SuspendVendorAsync(string vendorId, long sequence) =>
        Services.GetRequiredService<IEventPublisher>().PublishAsync(new DomainEventEnvelope<VendorSuspendedPayload>(
            Guid.NewGuid(), "VendorSuspended", 1, DateTimeOffset.UtcNow, "Vendor", vendorId, sequence,
            new VendorSuspendedPayload(vendorId, "test")));

    public async Task<ListingDocument> SeedListingAsync(
        string vendorId, string id, string name = "Country Sourdough", string status = ListingStatuses.Published, int priceCents = 800)
    {
        var now = DateTimeOffset.UtcNow;
        return await Listings.SaveAsync(new ListingDocument
        {
            Id = id,
            VendorId = vendorId,
            Name = name,
            Category = "Bread",
            PriceCents = priceCents,
            Status = status,
            CreatedAt = now,
            UpdatedAt = now,
            Version = 1,
            AllergenFlags = new() { "gluten" },
            Modifiers = new() { new ModifierDocument { Id = "mod-seeds", Name = "Seed crust", PriceDeltaCents = 100, Allergens = new() { "sesame" } } },
        }, vendorId);
    }
}
