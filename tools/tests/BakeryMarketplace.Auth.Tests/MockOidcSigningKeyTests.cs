using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// Register 204: the mock issuer made a new key at every start under the same key id, so services holding the old key refused tokens signed after a
/// restart for minutes. With a configured key, an issuer started again signs with the same key: a token from the new process passes against the
/// keys a service fetched from the old one.
/// </summary>
[Collection("SequentialAuth")]
public class MockOidcSigningKeyTests
{
    private static readonly string OrderingSecret = TestSecrets.Random();

    private static string NewKeyValue(int bits = 2048)
    {
        using var rsa = RSA.Create(bits);
        return Convert.ToBase64String(rsa.ExportPkcs8PrivateKey());
    }

    private static TestHost CreateServer(RsaSecurityKey? key) =>
        TestHost.Start(web => web
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer(
                    "bakery-marketplace", [new MockClient("ordering-service", OrderingSecret, [ServiceRoles.StockReserve])], null, "http://issuer.test",
                    signingKey: key));
            }));

    private static async Task<JsonWebKeySet> KeysOf(TestHost server)
    {
        using var client = server.CreateClient();
        return new JsonWebKeySet(await client.GetStringAsync("/.well-known/jwks.json"));
    }

    private static async Task<string> ServiceTokenFrom(TestHost server)
    {
        using var client = server.CreateClient();
        var response = await client.PostAsync("/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = "ordering-service",
            ["client_secret"] = OrderingSecret,
        }));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!["access_token"]!.ToString();
    }

    private static bool Validates(string token, JsonWebKeySet keys)
    {
        try
        {
            new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidIssuer = "http://issuer.test",
                ValidAudience = "bakery-marketplace",
                IssuerSigningKeys = keys.GetSigningKeys(),
            }, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }

    [Fact]
    public async Task WithTheSameConfiguredKey_ATokenSignedAfterARestartPassesAgainstTheKeysFetchedBefore()
    {
        var value = NewKeyValue();
        using var before = CreateServer(MockOidcIssuer.SigningKeyFromPkcs8Base64(value));
        var keysFetchedBefore = await KeysOf(before);
        using var after = CreateServer(MockOidcIssuer.SigningKeyFromPkcs8Base64(value)); // the issuer started again with the same .env

        var token = await ServiceTokenFrom(after);

        Assert.True(Validates(token, keysFetchedBefore));
        Assert.Equal(MockOidcIssuer.SigningKeyId, new JwtSecurityTokenHandler().ReadJwtToken(token).Header.Kid);
    }

    [Fact]
    public async Task WithADifferentKey_TheSameKeyIdNoLongerValidates_WhichIsWhatAPerProcessKeyDidOnRestart()
    {
        using var before = CreateServer(MockOidcIssuer.SigningKeyFromPkcs8Base64(NewKeyValue()));
        var keysFetchedBefore = await KeysOf(before);
        using var after = CreateServer(MockOidcIssuer.SigningKeyFromPkcs8Base64(NewKeyValue()));

        var token = await ServiceTokenFrom(after);

        Assert.False(Validates(token, keysFetchedBefore));
        Assert.Equal(keysFetchedBefore.Keys.Single().Kid, (await KeysOf(after)).Keys.Single().Kid);
    }

    [Fact]
    public async Task TheJwksPublishesTheConfiguredKey()
    {
        var value = NewKeyValue();
        using var rsa = RSA.Create();
        rsa.ImportPkcs8PrivateKey(Convert.FromBase64String(value), out _);
        using var server = CreateServer(MockOidcIssuer.SigningKeyFromPkcs8Base64(value));

        var published = (await KeysOf(server)).Keys.Single();

        Assert.Equal(Base64UrlEncoder.Encode(rsa.ExportParameters(false).Modulus), published.N);
        Assert.Equal(MockOidcIssuer.SigningKeyId, published.Kid);
    }

    [Theory]
    [InlineData("not base64 at all!")]
    [InlineData("AAAA")]
    public void AValueThatIsNotAPkcs8RsaKeyIsRefused_WithoutEchoingIt(string value)
    {
        var e = Assert.Throws<ArgumentException>(() => MockOidcIssuer.SigningKeyFromPkcs8Base64(value));
        Assert.DoesNotContain(value, e.Message);
    }

    [Fact]
    public void AKeyShorterThan2048BitsIsRefused()
    {
        Assert.Throws<ArgumentException>(() => MockOidcIssuer.SigningKeyFromPkcs8Base64(NewKeyValue(1024)));
    }
}
