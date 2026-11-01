using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>ADR-0019, WI-AUTH-007 phase 1: the mock issuer's refresh-token grant. Opaque, single use, rotated, revoked together on reuse.</summary>
[Collection("SequentialAuth")]
public class RefreshTokenGrantTests
{
    private const string Redirect = "http://localhost:3000/auth/callback";
    private const string ClientId = "web-queue-display";

    private sealed class ManualTime(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static TestServer CreateServer(TimeSpan? lifetime = null, TimeProvider? time = null) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer(refreshTokenLifetime: lifetime, timeProvider: time));
            }));

    private static string Challenge(string verifier) => Base64UrlEncoder.Encode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));

    /// <summary>The whole browser-less login: the user picks an account, the issuer redirects with a code, the code is exchanged with its verifier.</summary>
    private static async Task<JsonNode> LoginAsync(HttpClient client, string userId, string scope, string clientId = ClientId)
    {
        var verifier = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        var submit = await client.PostAsync("/authorize/submit", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["userId"] = userId,
            ["redirect_uri"] = Redirect,
            ["state"] = "s",
            ["code_challenge"] = Challenge(verifier),
            ["code_challenge_method"] = "S256",
            ["client_id"] = clientId,
            ["scope"] = scope,
        }));
        Assert.Equal(System.Net.HttpStatusCode.Redirect, submit.StatusCode);
        var code = System.Web.HttpUtility.ParseQueryString(submit.Headers.Location!.Query)["code"]!;

        var token = await client.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = Redirect,
            ["code_verifier"] = verifier,
            ["client_id"] = clientId,
        }));
        token.EnsureSuccessStatusCode();
        return JsonNode.Parse(await token.Content.ReadAsStringAsync())!;
    }

    private static Task<HttpResponseMessage> RefreshAsync(HttpClient client, string? refreshToken, string? clientId = ClientId)
    {
        var form = new Dictionary<string, string> { ["grant_type"] = "refresh_token", ["refresh_token"] = refreshToken ?? "" };
        if (clientId is not null) form["client_id"] = clientId;
        return client.PostAsync("/token", new FormUrlEncodedContent(form));
    }

    private static async Task<JsonNode> BodyAsync(HttpResponseMessage response) => JsonNode.Parse(await response.Content.ReadAsStringAsync())!;

    private static JwtSecurityToken Jwt(JsonNode body) => new JwtSecurityTokenHandler().ReadJwtToken(body["access_token"]!.ToString());

    [Fact]
    public async Task ALoginThatAsksForOfflineAccessGetsARefreshTokenAndOneThatDoesNotGetsNone()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var withIt = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");
        var without = await LoginAsync(client, MockUsers.Customer.Id, "openid");

        Assert.False(string.IsNullOrEmpty(withIt["refresh_token"]?.ToString()));
        Assert.Contains("offline_access", withIt["scope"]!.ToString());
        Assert.Null(without["refresh_token"]);
    }

    [Fact]
    public async Task DiscoveryAdvertisesTheGrantAndTheScope()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var config = JsonNode.Parse(await client.GetStringAsync("/.well-known/openid-configuration"))!;

        Assert.Contains("refresh_token", config["grant_types_supported"]!.AsArray().Select(g => g!.ToString()));
        Assert.Contains("offline_access", config["scopes_supported"]!.AsArray().Select(g => g!.ToString()));
    }

    [Fact]
    public async Task RefreshingGivesANewAccessTokenForTheSameUserAndANewRefreshToken()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var first = await LoginAsync(client, MockUsers.Vendor.Id, "openid offline_access");

        var response = await RefreshAsync(client, first["refresh_token"]!.ToString());

        response.EnsureSuccessStatusCode();
        var second = await BodyAsync(response);
        var original = Jwt(first);
        var renewed = Jwt(second);
        Assert.Equal(original.Subject, renewed.Subject);
        Assert.Equal(original.Claims.Where(c => c.Type == "roles").Select(c => c.Value), renewed.Claims.Where(c => c.Type == "roles").Select(c => c.Value));
        Assert.Equal("Vendor", renewed.Claims.Single(c => c.Type == "roles").Value);
        Assert.NotEqual(first["refresh_token"]!.ToString(), second["refresh_token"]!.ToString());
        Assert.NotEqual(first["access_token"]!.ToString(), second["access_token"]!.ToString());
        Assert.Equal(3600, second["expires_in"]!.GetValue<int>());
        Assert.True(second["refresh_token"]!.ToString().Length >= 43); // 32 random bytes
    }

    [Fact]
    public async Task ARefreshTokenWorksOnceAndThenTheNextOneDoes()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var first = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");

        var one = await BodyAsync(await RefreshAsync(client, first["refresh_token"]!.ToString()));
        var two = await RefreshAsync(client, one["refresh_token"]!.ToString());

        Assert.True(two.IsSuccessStatusCode);
    }

    [Fact]
    public async Task UsingARotatedTokenAgainIsRefusedAndRevokesTheWholeLogin()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var first = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");
        var old = first["refresh_token"]!.ToString();
        var second = await BodyAsync(await RefreshAsync(client, old));

        var replay = await RefreshAsync(client, old);
        var heir = await RefreshAsync(client, second["refresh_token"]!.ToString()); // the legitimate holder is cut off too

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, replay.StatusCode);
        Assert.Equal("invalid_grant", (await BodyAsync(replay))["error"]!.ToString());
        Assert.Equal("invalid_grant", (await BodyAsync(heir))["error"]!.ToString());
    }

    [Fact]
    public async Task AnotherLoginIsNotAffectedByTheRevocationOfThisOne()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var mine = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");
        var theirs = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");
        await RefreshAsync(client, mine["refresh_token"]!.ToString());
        await RefreshAsync(client, mine["refresh_token"]!.ToString()); // reuse: this family is revoked

        var other = await RefreshAsync(client, theirs["refresh_token"]!.ToString());

        Assert.True(other.IsSuccessStatusCode);
    }

    [Fact]
    public async Task ARefreshTokenExpiresAndEachUseRenewsTheNext()
    {
        var time = new ManualTime(new DateTimeOffset(2026, 11, 2, 9, 0, 0, TimeSpan.Zero));
        using var server = CreateServer(TimeSpan.FromHours(1), time);
        using var client = server.CreateClient();
        var first = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");

        time.Now = time.Now.AddMinutes(40);
        var second = await BodyAsync(await RefreshAsync(client, first["refresh_token"]!.ToString())); // within the hour: renewed for another hour
        time.Now = time.Now.AddMinutes(50);
        var third = await RefreshAsync(client, second["refresh_token"]!.ToString()); // 90 minutes after login, 50 after the last use
        time.Now = time.Now.AddMinutes(61);
        var late = await RefreshAsync(client, (await BodyAsync(third))["refresh_token"]!.ToString());

        Assert.True(third.IsSuccessStatusCode);
        Assert.Equal(System.Net.HttpStatusCode.BadRequest, late.StatusCode);
        Assert.Equal("invalid_grant", (await BodyAsync(late))["error"]!.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-token")]
    public async Task UnknownOrMissingRefreshTokensAreRefusedWithAFixedMessage(string? token)
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await RefreshAsync(client, token);
        var body = await BodyAsync(response);

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_grant", body["error"]!.ToString());
        Assert.DoesNotContain("not-a-token", body.ToJsonString()); // nothing the caller sent is echoed
    }

    [Fact]
    public async Task ARefreshTokenIsRefusedToAnotherClient()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var login = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");

        var wrongClient = await RefreshAsync(client, login["refresh_token"]!.ToString(), "web-customer");
        var rightClient = await RefreshAsync(client, login["refresh_token"]!.ToString());

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, wrongClient.StatusCode);
        Assert.True(rightClient.IsSuccessStatusCode); // the refusal did not spend the token
    }

    [Fact]
    public async Task ARefreshCannotChangeWhoTheTokenIsFor()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();
        var login = await LoginAsync(client, MockUsers.Customer.Id, "openid offline_access");

        var response = await client.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = login["refresh_token"]!.ToString(),
            ["client_id"] = ClientId,
            ["mock_user_id"] = MockUsers.ShopVendor.Id, // ignored
            ["scope"] = "openid offline_access admin", // ignored
        }));

        response.EnsureSuccessStatusCode();
        var token = Jwt(await BodyAsync(response));
        Assert.Equal(MockUsers.Customer.Id, token.Subject);
        Assert.Equal("Customer", token.Claims.Single(c => c.Type == "roles").Value);
    }
}
