using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// A fixed issuer string (WI-DEP-001): a container reaches the mock issuer by one name and a browser by another, but a tenant has one issuer.
/// The issuer in tokens and discovery is the configured one; the endpoint addresses still follow the request.
/// </summary>
[Collection("SequentialAuth")]
public class MockOidcFixedIssuerTests
{
    private const string Issuer = "https://login.example.test";
    private static readonly string OrderingSecret = TestSecrets.Random();

    private static TestServer CreateServer(string? issuer) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer(
                    "bakery-marketplace", [new MockClient("ordering-service", OrderingSecret, [ServiceRoles.StockReserve])], null, issuer));
            }));

    [Fact]
    public async Task Discovery_ReportsTheConfiguredIssuer_AndEndpointsFollowTheRequest()
    {
        using var server = CreateServer(Issuer + "/");
        using var client = server.CreateClient();

        var doc = JsonNode.Parse(await client.GetStringAsync("/.well-known/openid-configuration"))!;

        Assert.Equal(Issuer, doc["issuer"]!.ToString());
        Assert.Equal("http://localhost/.well-known/jwks.json", doc["jwks_uri"]!.ToString());
        Assert.Equal("http://localhost/token", doc["token_endpoint"]!.ToString());
    }

    [Fact]
    public async Task ClientCredentialsToken_CarriesTheConfiguredIssuer()
    {
        using var server = CreateServer(Issuer);
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = "ordering-service",
            ["client_secret"] = OrderingSecret,
        }));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = new JwtSecurityTokenHandler().ReadJwtToken(JsonNode.Parse(await response.Content.ReadAsStringAsync())!["access_token"]!.ToString());
        Assert.Equal(Issuer, token.Issuer);
    }

    [Fact]
    public async Task WithoutAFixedIssuer_TheIssuerIsTheRequestHost()
    {
        using var server = CreateServer(null);
        using var client = server.CreateClient();

        var doc = JsonNode.Parse(await client.GetStringAsync("/.well-known/openid-configuration"))!;

        Assert.Equal("http://localhost", doc["issuer"]!.ToString());
    }

    [Theory]
    [InlineData("not a url")]
    [InlineData("ftp://login.example.test")]
    [InlineData("https://user:pw@login.example.test")]
    [InlineData("https://login.example.test/#frag")]
    public void AnInvalidIssuerIsRefusedAtStartup(string issuer)
    {
        Assert.Throws<ArgumentException>(() => CreateServer(issuer));
    }

    [Fact]
    public void AddBakeryAuth_UsesTheMetadataAddressWhenConfigured_AndNotOtherwise()
    {
        static Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions Options(Dictionary<string, string?> settings)
        {
            var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
            var services = new ServiceCollection();
            services.AddBakeryAuth(config, requireHttpsMetadata: false);
            using var provider = services.BuildServiceProvider();
            return provider.GetRequiredService<Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerOptions>>()
                .Get(Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerDefaults.AuthenticationScheme);
        }

        var withOverride = Options(new() { ["Auth:Authority"] = "http://localhost:5100", ["Auth:Audience"] = "a", ["Auth:MetadataAddress"] = "http://mock-oidc:5100/.well-known/openid-configuration" });
        var without = Options(new() { ["Auth:Authority"] = "http://localhost:5100", ["Auth:Audience"] = "a" });

        Assert.Equal("http://mock-oidc:5100/.well-known/openid-configuration", withOverride.MetadataAddress);
        Assert.Equal("http://localhost:5100", withOverride.TokenValidationParameters.ValidIssuer);
        Assert.Equal("http://localhost:5100/.well-known/openid-configuration", without.MetadataAddress); // the framework default: Authority + /.well-known
    }
}
