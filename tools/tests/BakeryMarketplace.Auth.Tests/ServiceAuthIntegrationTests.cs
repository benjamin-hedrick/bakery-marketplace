using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// ADR-0018 end to end: a service gets a token from the mock issuer with the client credentials grant and calls an API that runs the real
/// <see cref="AuthServiceExtensions.AddBakeryAuth"/> middleware and the <see cref="ServicePolicies"/> policy. A user token must not pass, a
/// service token must not pass user policies, and the audience rules hold.
/// </summary>
[Collection("SequentialAuth")]
public class ServiceAuthIntegrationTests : IAsyncLifetime
{
    private const string Audience = "bakery-marketplace";
    private const string CatalogAudience = "api://catalog-test";

    private static readonly string OrderingSecret = TestSecrets.Random();
    private static readonly string NoRolesSecret = TestSecrets.Random();
    private static readonly string CatalogSecret = TestSecrets.Random();
    private static readonly string StrangerSecret = TestSecrets.Random();

    private TestServer _issuerServer = null!;
    private HttpClient _issuer = null!;
    private TestServer _apiServer = null!;
    private HttpClient _api = null!;

    public Task InitializeAsync()
    {
        MockClient[] clients =
        [
            new("ordering-service", OrderingSecret, [ServiceRoles.StockReserve]),
            new("no-roles", NoRolesSecret, []),
            new("catalog-audience", CatalogSecret, [ServiceRoles.StockReserve], Audience: CatalogAudience),
            new("stranger", StrangerSecret, [ServiceRoles.StockReserve], Audience: "api://not-accepted"),
        ];
        _issuerServer = new TestServer(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer(Audience, clients));
            }));
        _issuer = _issuerServer.CreateClient();
        var issuerUrl = _issuer.BaseAddress!.ToString().TrimEnd('/');
        var issuerHandler = _issuerServer.CreateHandler();

        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Authority"] = issuerUrl,
            ["Auth:Audience"] = Audience,
            ["Auth:Audiences:0"] = CatalogAudience, // a service API may accept its own audience as well
        }).Build();

        _apiServer = new TestServer(new WebHostBuilder()
            .ConfigureServices(services =>
            {
                services.AddBakeryAuth(config, requireHttpsMetadata: false);
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    options.BackchannelHttpHandler = issuerHandler;
                    options.ConfigurationManager = new Microsoft.IdentityModel.Protocols.ConfigurationManager<Microsoft.IdentityModel.Protocols.OpenIdConnect.OpenIdConnectConfiguration>(
                        $"{issuerUrl}/.well-known/openid-configuration",
                        new Microsoft.IdentityModel.Protocols.OpenIdConnect.OpenIdConnectConfigurationRetriever(),
                        new Microsoft.IdentityModel.Protocols.HttpDocumentRetriever(new HttpClient(issuerHandler)) { RequireHttps = false });
                });
                services.AddRouting();
            })
            .Configure(app =>
            {
                app.UseRouting();
                app.UseAuthentication();
                app.UseAuthorization();
                app.UseEndpoints(endpoints =>
                {
                    endpoints.MapPost("/stock/reservations", (HttpContext ctx) =>
                        Results.Ok(new { caller = ServiceCaller.ClientId(ctx.User) }))
                        .RequireAuthorization(ServicePolicies.StockReserve);
                    endpoints.MapGet("/vendor-only", () => Results.Ok("vendor")).RequireAuthorization("VendorRole");
                });
            }));
        _api = _apiServer.CreateClient();
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _issuer.Dispose();
        _issuerServer.Dispose();
        _api.Dispose();
        _apiServer.Dispose();
        return Task.CompletedTask;
    }

    private async Task<string> ServiceToken(string clientId, string secret, string? scope = null)
    {
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = clientId,
            ["client_secret"] = secret,
        };
        if (scope is not null) form["scope"] = scope;
        var response = await _issuer.PostAsync("/token", new FormUrlEncodedContent(form));
        response.EnsureSuccessStatusCode();
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!["access_token"]!.ToString();
    }

    private async Task<string> UserToken(string userId)
    {
        var verifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var authorize = await _issuer.PostAsync("/authorize/submit", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["userId"] = userId,
            ["redirect_uri"] = "http://localhost/cb",
            ["state"] = "s",
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256",
        }));
        var code = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(authorize.Headers.Location!.Query)["code"].ToString();
        var token = await _issuer.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = "http://localhost/cb",
            ["code_verifier"] = verifier,
        }));
        token.EnsureSuccessStatusCode();
        return JsonNode.Parse(await token.Content.ReadAsStringAsync())!["access_token"]!.ToString();
    }

    private Task<HttpResponseMessage> Call(HttpMethod method, string path, string? token)
    {
        var request = new HttpRequestMessage(method, path);
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return _api.SendAsync(request);
    }

    [Fact]
    public async Task AServiceTokenWithTheRoleIsAcceptedOnTheServiceEndpoint_AndTheCallerIsIdentified()
    {
        var token = await ServiceToken("ordering-service", OrderingSecret);

        var response = await Call(HttpMethod.Post, "/stock/reservations", token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ordering-service", JsonNode.Parse(await response.Content.ReadAsStringAsync())!["caller"]!.ToString());
    }

    [Theory]
    [InlineData("user-customer-1")]
    [InlineData("user-vendor-1")]
    [InlineData("user-admin-1")]
    public async Task AUserTokenIsRefusedOnTheServiceEndpoint(string userId)
    {
        var token = await UserToken(userId);

        var response = await Call(HttpMethod.Post, "/stock/reservations", token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AServiceTokenIsRefusedOnAUserEndpoint()
    {
        var token = await ServiceToken("ordering-service", OrderingSecret);

        var response = await Call(HttpMethod.Get, "/vendor-only", token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AServiceTokenWithoutTheRoleIsRefused()
    {
        var token = await ServiceToken("no-roles", NoRolesSecret);

        var response = await Call(HttpMethod.Post, "/stock/reservations", token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task NoTokenAndABrokenTokenAreUnauthorized()
    {
        var good = await ServiceToken("ordering-service", OrderingSecret);
        var tampered = good[..^4] + (good.EndsWith("AAAA") ? "BBBB" : "AAAA");

        Assert.Equal(HttpStatusCode.Unauthorized, (await Call(HttpMethod.Post, "/stock/reservations", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Call(HttpMethod.Post, "/stock/reservations", tampered)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Call(HttpMethod.Post, "/stock/reservations", "not-a-token")).StatusCode);
    }

    [Fact]
    public async Task AnAudienceTheApiAcceptsWorks_AndOneItDoesNotIsUnauthorized()
    {
        var accepted = await ServiceToken("catalog-audience", CatalogSecret, scope: $"{CatalogAudience}/.default");
        var rejected = await ServiceToken("stranger", StrangerSecret, scope: "api://not-accepted/.default");

        Assert.Equal(HttpStatusCode.OK, (await Call(HttpMethod.Post, "/stock/reservations", accepted)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Call(HttpMethod.Post, "/stock/reservations", rejected)).StatusCode);
    }

    [Fact]
    public async Task TheProviderAndHandlerWorkEndToEndAgainstTheMockIssuer()
    {
        var options = Microsoft.Extensions.Options.Options.Create(new ClientCredentialsOptions
        {
            TokenEndpoint = new Uri(_issuer.BaseAddress!, "/token").ToString(),
            ClientId = "ordering-service",
            Scope = $"{Audience}/.default",
            ClientSecret = OrderingSecret,
        });
        var provider = new ClientCredentialsTokenProvider(_issuerServer.CreateClient(), options);
        // The handler sits in front of the API's test handler, the way a typed client to catalog will.
        using var client = new HttpClient(new ClientCredentialsHandler(provider) { InnerHandler = _apiServer.CreateHandler() })
        {
            BaseAddress = _api.BaseAddress,
        };

        var response = await client.PostAsync("/stock/reservations", content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
