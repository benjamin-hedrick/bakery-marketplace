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
/// Integration tests proving that tokens issued by <see cref="MockOidcIssuer"/> are accepted and
/// rejected by <see cref="AuthServiceExtensions.AddBakeryAuth"/> — the same real middleware used
/// by every backend service — when pointed at the mock issuer's JWKS endpoint via config-driven
/// Authority swap.
///
/// This satisfies the AUTH-005 Definition of Done middleware round-trip requirement:
/// "xUnit/integration test proving the full PKCE round-trip is accepted by AUTH-001's actual
/// middleware — not just this issuer's own tests in isolation."
///
/// A mismatched code_verifier must be rejected; a request for a nonexistent mock user must fail
/// cleanly. An unauthenticated request must return 401; a token signed by a different key must
/// be rejected by the middleware.
/// See WI-AUTH-005.
/// </summary>
[Collection("SequentialAuth")]
public class MockOidcMiddlewareIntegrationTests : IAsyncLifetime
{
    // The mock issuer runs on its own TestServer; the protected API runs on a second TestServer
    // pointed at the first one's base URL for Authority/JWKS resolution.
    private TestServer _issuerServer = null!;
    private HttpClient _issuerClient = null!;

    private TestServer _apiServer = null!;
    private HttpClient _apiClient = null!;

    private const string Audience = "bakery-marketplace";

    public async Task InitializeAsync()
    {
        // --- Issuer server ---
        var issuerBuilder = new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer(Audience));
            });

        _issuerServer = new TestServer(issuerBuilder);
        _issuerClient = _issuerServer.CreateClient();

        // The mock issuer's base URL is the Authority for the middleware.
        // TestServer uses http://localhost — RequireHttpsMetadata must be false.
        var issuerBaseUrl = _issuerClient.BaseAddress!.ToString().TrimEnd('/');

        // The JwtBearer middleware fetches /.well-known/openid-configuration and JWKS over an
        // internal HttpClient (the "backchannel").  We provide the issuer's TestServer handler
        // as the backchannel so all metadata resolution stays in-process.
        var issuerHandler = _issuerServer.CreateHandler();

        // --- Protected API server ---
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Auth:Authority"] = issuerBaseUrl,
                ["Auth:Audience"] = Audience
            })
            .Build();

        var apiBuilder = new WebHostBuilder()
            .ConfigureServices(services =>
            {
                // Use requireHttpsMetadata: false because the TestServer issuer is on HTTP.
                // This is the config-driven local-dev swap posture from ADR-0006 — not a fallback.
                services.AddBakeryAuth(config, requireHttpsMetadata: false);

                // Route the JWT middleware's metadata fetches through the issuer TestServer handler.
                services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    options.BackchannelHttpHandler = issuerHandler;
                    var httpHandler = new HttpClient(issuerHandler);
                    var docRetriever = new Microsoft.IdentityModel.Protocols.HttpDocumentRetriever(httpHandler)
                    {
                        RequireHttps = false
                    };
                    options.ConfigurationManager = new Microsoft.IdentityModel.Protocols.ConfigurationManager<Microsoft.IdentityModel.Protocols.OpenIdConnect.OpenIdConnectConfiguration>(
                        $"{issuerBaseUrl}/.well-known/openid-configuration",
                        new Microsoft.IdentityModel.Protocols.OpenIdConnect.OpenIdConnectConfigurationRetriever(),
                        docRetriever
                    );
                });

                services.AddRouting();
            })
            .Configure(app =>
            {
                // Correct ASP.NET Core middleware pipeline order:
                // UseRouting → UseAuthentication → UseAuthorization → UseEndpoints
                app.UseRouting();
                app.UseAuthentication();
                app.UseAuthorization();
                app.UseEndpoints(endpoints =>
                {
                    endpoints.MapGet("/protected", (HttpContext ctx) =>
                    {
                        var sub = ctx.User.FindFirst("sub")?.Value
                            ?? ctx.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                        var roles = ctx.User.FindFirst("roles")?.Value;
                        return Results.Ok(new { sub, roles });
                    }).RequireAuthorization();

                    endpoints.MapGet("/vendor-only", (HttpContext ctx) =>
                        Results.Ok("vendor access granted"))
                        .RequireAuthorization("VendorRole");
                });
            });

        _apiServer = new TestServer(apiBuilder);
        _apiClient = _apiServer.CreateClient();

        await Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _issuerClient.Dispose();
        _issuerServer.Dispose();
        _apiClient.Dispose();
        _apiServer.Dispose();
        return Task.CompletedTask;
    }

    // -----------------------------------------------------------------------------------------
    // Helper: run a full PKCE authorization_code flow against the mock issuer and return the
    // access_token string.
    // -----------------------------------------------------------------------------------------
    private async Task<string> GetTokenViaPkce(string userId)
    {
        var codeVerifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        using var sha256 = SHA256.Create();
        var codeChallenge = Base64UrlEncoder.Encode(sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier)));

        var authContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "userId", userId },
            { "redirect_uri", "http://localhost/cb" },
            { "state", "roundtrip-test" },
            { "code_challenge", codeChallenge },
            { "code_challenge_method", "S256" }
        });

        var authResponse = await _issuerClient.PostAsync("/authorize/submit", authContent);
        Assert.Equal(HttpStatusCode.Redirect, authResponse.StatusCode);

        var redirectUri = authResponse.Headers.Location!;
        var queryParams = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(redirectUri.Query);
        var code = queryParams["code"].ToString();

        var tokenContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "authorization_code" },
            { "code", code },
            { "redirect_uri", "http://localhost/cb" },
            { "code_verifier", codeVerifier }
        });

        var tokenResponse = await _issuerClient.PostAsync("/token", tokenContent);
        tokenResponse.EnsureSuccessStatusCode();

        var json = JsonNode.Parse(await tokenResponse.Content.ReadAsStringAsync());
        return json!["access_token"]!.ToString();
    }

    // -----------------------------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------------------------

    /// <summary>
    /// Core DoD requirement: a token issued via a full PKCE flow is accepted by AddBakeryAuth's
    /// real JWT middleware, and the token's claims (sub, roles) are present on the principal.
    /// </summary>
    [Fact]
    public async Task PkceRoundTrip_TokenIssuedByMockIssuer_IsAcceptedByRealMiddleware()
    {
        var accessToken = await GetTokenViaPkce(MockUsers.Vendor.Id);

        var request = new HttpRequestMessage(HttpMethod.Get, "/protected");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _apiClient.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(MockUsers.Vendor.Id, body!["sub"]!.ToString());
        Assert.Equal("Vendor", body["roles"]!.ToString());
    }

    /// <summary>
    /// Customer PKCE flow also produces a middleware-accepted token with the Customer role claim.
    /// </summary>
    [Fact]
    public async Task PkceRoundTrip_CustomerToken_IsAcceptedByMiddleware()
    {
        var accessToken = await GetTokenViaPkce(MockUsers.Customer.Id);

        var request = new HttpRequestMessage(HttpMethod.Get, "/protected");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        var response = await _apiClient.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Customer", body!["roles"]!.ToString());
    }

    /// <summary>
    /// DoD requirement: a mismatched code_verifier is rejected by the issuer (400) before the
    /// middleware is ever reached — no token is issued.
    /// </summary>
    [Fact]
    public async Task PkceRoundTrip_MismatchedCodeVerifier_IsRejectedByIssuer()
    {
        var codeVerifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        using var sha256 = SHA256.Create();
        var codeChallenge = Base64UrlEncoder.Encode(sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier)));

        var authContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "userId", MockUsers.Admin.Id },
            { "redirect_uri", "http://localhost/cb" },
            { "code_challenge", codeChallenge },
            { "code_challenge_method", "S256" }
        });

        var authResponse = await _issuerClient.PostAsync("/authorize/submit", authContent);
        var redirectUri = authResponse.Headers.Location!;
        var code = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(redirectUri.Query)["code"].ToString();

        var tokenContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "authorization_code" },
            { "code", code },
            { "redirect_uri", "http://localhost/cb" },
            { "code_verifier", "wrong_verifier_value" }    // intentionally wrong
        });

        var tokenResponse = await _issuerClient.PostAsync("/token", tokenContent);
        Assert.Equal(HttpStatusCode.BadRequest, tokenResponse.StatusCode);
    }

    /// <summary>
    /// DoD requirement: a request for a nonexistent mock user must fail cleanly (400 from issuer).
    /// </summary>
    [Fact]
    public async Task NonexistentMockUser_DirectMintRequest_IsRejectedByIssuer()
    {
        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "client_credentials" },
            { "mock_user_id", "user-does-not-exist" }
        });

        var response = await _issuerClient.PostAsync("/token", content);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>
    /// Sanity check: the protected endpoint returns 401 when no token is provided — the
    /// middleware is correctly protecting the route.
    /// </summary>
    [Fact]
    public async Task NoToken_ReturnsUnauthorized()
    {
        var response = await _apiClient.GetAsync("/protected");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// A token with the correct issuer claim but signed with a different RSA key must be rejected
    /// by the middleware (401), proving that the JWKS-based key validation is enforced.
    /// </summary>
    [Fact]
    public async Task WrongSigningKey_TokenRejectedByMiddleware()
    {
        using var rogueRsa = RSA.Create(2048);
        var rogueKey = new RsaSecurityKey(rogueRsa);
        var creds = new SigningCredentials(rogueKey, SecurityAlgorithms.RsaSha256);

        var claims = new[]
        {
            new System.Security.Claims.Claim("sub", "attacker"),
            new System.Security.Claims.Claim("roles", "Admin")
        };

        var issuerBaseUrl = _issuerClient.BaseAddress!.ToString().TrimEnd('/');
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityToken(
            issuer: issuerBaseUrl,
            audience: Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);

        var tokenString = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().WriteToken(token);

        var request = new HttpRequestMessage(HttpMethod.Get, "/protected");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenString);
        var response = await _apiClient.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
