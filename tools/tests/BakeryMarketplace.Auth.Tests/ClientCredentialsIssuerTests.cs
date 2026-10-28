using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>The mock issuer's client credentials grant (ADR-0018, WI-AUTH-006): it must authenticate the client, not just hand out tokens.</summary>
[Collection("SequentialAuth")]
public class ClientCredentialsIssuerTests
{
    private static readonly string OrderingSecret = TestSecrets.Random();
    private static readonly MockClient Ordering = new("ordering-service", OrderingSecret, [ServiceRoles.StockReserve]);

    private static TestServer CreateServer(params MockClient[] clients) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer("bakery-marketplace", clients));
            }));

    private static FormUrlEncodedContent Form(params (string Key, string Value)[] fields) =>
        new(fields.ToDictionary(f => f.Key, f => f.Value));

    private static JwtSecurityToken Read(string json) =>
        new JwtSecurityTokenHandler().ReadJwtToken(JsonNode.Parse(json)!["access_token"]!.ToString());

    [Fact]
    public async Task RegisteredClientWithTheRightSecret_GetsAnAppOnlyToken()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", Form(
            ("grant_type", "client_credentials"), ("client_id", "ordering-service"), ("client_secret", OrderingSecret),
            ("scope", "bakery-marketplace/.default")));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        var json = JsonNode.Parse(body)!;
        Assert.Equal("Bearer", json["token_type"]!.ToString());
        Assert.Null(json["id_token"]);

        var token = Read(body);
        Assert.Equal("ordering-service", token.Subject);
        Assert.Equal("ordering-service", token.Claims.Single(c => c.Type == "client_id").Value);
        Assert.Equal("app", token.Claims.Single(c => c.Type == "idtyp").Value);
        Assert.Equal([ServiceRoles.StockReserve], token.Claims.Where(c => c.Type == "roles").Select(c => c.Value));
        Assert.Contains("bakery-marketplace", token.Audiences);
        // An app-only token carries no user claims.
        Assert.DoesNotContain(token.Claims, c => c.Type is "name" or "email" or "vendorType");
    }

    [Fact]
    public async Task HttpBasicClientAuthenticationWorks()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/token") { Content = Form(("grant_type", "client_credentials")) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes($"{Uri.EscapeDataString("ordering-service")}:{Uri.EscapeDataString(OrderingSecret)}")));

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AWrongSecretIsRefused_With400ForFormCredentials()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", Form(
            ("grant_type", "client_credentials"), ("client_id", "ordering-service"), ("client_secret", TestSecrets.Random())));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_client", JsonNode.Parse(await response.Content.ReadAsStringAsync())!["error"]!.ToString());
    }

    [Fact]
    public async Task AWrongSecretIsRefused_With401AndAChallengeForBasicCredentials()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/token") { Content = Form(("grant_type", "client_credentials")) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes("ordering-service:wrong")));

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(response.Headers.WwwAuthenticate, h => h.Scheme == "Basic");
    }

    [Fact]
    public async Task AnUnknownClientLooksExactlyLikeAWrongSecret()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var unknown = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("client_id", "nobody"), ("client_secret", OrderingSecret)));
        var wrong = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("client_id", "ordering-service"), ("client_secret", "x")));

        Assert.Equal(wrong.StatusCode, unknown.StatusCode);
        Assert.Equal(await wrong.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task WithNoClientsRegistered_EveryRequestIsRefused()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("client_id", "ordering-service"), ("client_secret", OrderingSecret)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("admin")]
    [InlineData("user-admin-1")]
    public async Task TheOldUnauthenticatedUserMintingShortcutIsGone(string mockUserId)
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("mock_user_id", mockUserId)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain("access_token", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ARegisteredClientCannotUseMockUserIdToGetAUserToken()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var response = await client.PostAsync("/token", Form(
            ("grant_type", "client_credentials"), ("client_id", "ordering-service"), ("client_secret", OrderingSecret), ("mock_user_id", "admin")));

        response.EnsureSuccessStatusCode();
        var token = Read(await response.Content.ReadAsStringAsync());
        Assert.Equal("ordering-service", token.Subject);
        Assert.DoesNotContain(token.Claims, c => c.Type == "roles" && c.Value == "Admin");
    }

    [Fact]
    public async Task OnlyTheClientsOwnAudienceCanBeRequested()
    {
        var scoped = new MockClient("scoped", TestSecrets.Random(), [ServiceRoles.StockReserve], Audience: "api://catalog");
        using var server = CreateServer(scoped);
        using var client = server.CreateClient();

        var ok = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("client_id", "scoped"),
            ("client_secret", scoped.Secret), ("scope", "api://catalog/.default")));
        var other = await client.PostAsync("/token", Form(("grant_type", "client_credentials"), ("client_id", "scoped"),
            ("client_secret", scoped.Secret), ("scope", "api://something-else/.default")));

        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("api://catalog", Read(await ok.Content.ReadAsStringAsync()).Audiences);
        Assert.Equal(HttpStatusCode.BadRequest, other.StatusCode);
        Assert.Equal("invalid_scope", JsonNode.Parse(await other.Content.ReadAsStringAsync())!["error"]!.ToString());
    }

    [Fact]
    public void AWeakOrMissingSecretCannotBeRegistered()
    {
        Assert.Throws<ArgumentException>(() => CreateServer(new MockClient("weak", "short", [])));
        Assert.Throws<ArgumentException>(() => CreateServer(new MockClient("", TestSecrets.Random(), [])));
    }

    [Fact]
    public void ARegistrationNeverPrintsItsSecret()
    {
        var text = Ordering.ToString();

        Assert.DoesNotContain(OrderingSecret, text);
        Assert.Contains("ordering-service", text);
    }

    [Fact]
    public async Task DiscoveryAdvertisesTheClientAuthenticationMethods()
    {
        using var server = CreateServer(Ordering);
        using var client = server.CreateClient();

        var json = JsonNode.Parse(await client.GetStringAsync("/.well-known/openid-configuration"))!;

        var methods = json["token_endpoint_auth_methods_supported"]!.AsArray().Select(n => n!.ToString()).ToArray();
        Assert.Contains("client_secret_basic", methods);
        Assert.Contains("client_secret_post", methods);
    }
}

/// <summary>Random per-run values for tests, so no secret-looking string is committed.</summary>
internal static class TestSecrets
{
    public static string Random() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
}
