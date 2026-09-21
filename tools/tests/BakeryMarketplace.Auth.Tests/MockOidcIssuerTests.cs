using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth.Tests;

[Collection("SequentialAuth")]
public class MockOidcIssuerTests
{
    private TestServer CreateServer()
    {
        var builder = new WebHostBuilder()
            .ConfigureServices(services =>
            {
                services.AddRouting();
            })
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints =>
                {
                    endpoints.MapMockOidcIssuer();
                });
            });

        return new TestServer(builder);
    }

    [Fact]
    public async Task OpenIdConfiguration_ReturnsExpectedEndpoints()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/.well-known/openid-configuration");
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        var json = JsonNode.Parse(content);

        Assert.NotNull(json);
        Assert.EndsWith("/.well-known/jwks.json", json["jwks_uri"]!.ToString());
        Assert.EndsWith("/authorize", json["authorization_endpoint"]!.ToString());
        Assert.EndsWith("/token", json["token_endpoint"]!.ToString());
    }

    [Fact]
    public async Task Jwks_ReturnsRsaKey()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/.well-known/jwks.json");
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        var json = JsonNode.Parse(content);

        Assert.NotNull(json);
        var keys = json["keys"] as JsonArray;
        Assert.NotNull(keys);
        Assert.NotEmpty(keys);

        var key = keys[0]!;
        Assert.Equal("RSA", key["kty"]!.ToString());
        Assert.Equal("mock-key-1", key["kid"]!.ToString());
    }

    [Fact]
    public async Task Authorize_ValidRequest_ShowsHtml()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await client.GetAsync("/authorize?response_type=code&redirect_uri=http://localhost/cb");
        response.EnsureSuccessStatusCode();

        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("Mock OIDC Login", content);
        Assert.Contains(MockUsers.Customer.Id, content);
    }

    [Fact]
    public async Task Token_ClientCredentials_ReturnsToken()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "client_credentials" },
            { "mock_user_id", MockUsers.Admin.Id }
        });

        var response = await client.PostAsync("/token", content);
        response.EnsureSuccessStatusCode();

        var responseContent = await response.Content.ReadAsStringAsync();
        var json = JsonNode.Parse(responseContent);

        Assert.NotNull(json);
        Assert.NotNull(json["access_token"]);
        Assert.Equal("Bearer", json["token_type"]!.ToString());
    }

    [Fact]
    public async Task PkceFlow_Succeeds()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        
        // 1. Setup PKCE
        var codeVerifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        using var sha256 = SHA256.Create();
        var codeChallenge = Base64UrlEncoder.Encode(sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier)));

        // 2. Submit form to /authorize/submit
        var authContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "userId", MockUsers.Vendor.Id },
            { "redirect_uri", "http://localhost/cb" },
            { "state", "xyz" },
            { "code_challenge", codeChallenge },
            { "code_challenge_method", "S256" }
        });

        var authResponse = await client.PostAsync("/authorize/submit", authContent);
        Assert.Equal(HttpStatusCode.Redirect, authResponse.StatusCode);

        var redirectUri = authResponse.Headers.Location;
        Assert.NotNull(redirectUri);

        var queryParams = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(redirectUri.Query);
        Assert.True(queryParams.TryGetValue("code", out var codes));
        var code = codes.ToString();

        // 3. Exchange code for token
        var tokenContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "authorization_code" },
            { "code", code },
            { "redirect_uri", "http://localhost/cb" },
            { "code_verifier", codeVerifier }
        });

        var tokenResponse = await client.PostAsync("/token", tokenContent);
        tokenResponse.EnsureSuccessStatusCode();

        var responseString = await tokenResponse.Content.ReadAsStringAsync();
        var json = JsonNode.Parse(responseString);
        
        Assert.NotNull(json);
        Assert.NotNull(json["access_token"]);
    }

    [Fact]
    public async Task PkceFlow_InvalidVerifier_Fails()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        
        var codeVerifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        using var sha256 = SHA256.Create();
        var codeChallenge = Base64UrlEncoder.Encode(sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier)));

        var authContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "userId", MockUsers.Vendor.Id },
            { "redirect_uri", "http://localhost/cb" },
            { "code_challenge", codeChallenge },
            { "code_challenge_method", "S256" }
        });

        var authResponse = await client.PostAsync("/authorize/submit", authContent);
        var redirectUri = authResponse.Headers.Location;
        var queryParams = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(redirectUri!.Query);
        var code = queryParams["code"].ToString();

        var tokenContent = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            { "grant_type", "authorization_code" },
            { "code", code },
            { "redirect_uri", "http://localhost/cb" },
            { "code_verifier", "wrong_verifier" }
        });

        var tokenResponse = await client.PostAsync("/token", tokenContent);
        Assert.Equal(HttpStatusCode.BadRequest, tokenResponse.StatusCode);
    }
}
