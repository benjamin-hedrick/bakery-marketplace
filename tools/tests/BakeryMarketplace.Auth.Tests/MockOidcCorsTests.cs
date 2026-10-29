using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// The browser app exchanges its authorization code at the issuer's token endpoint directly (ADR-0012: the Next.js server never holds user
/// tokens), so the dev-only mock issuer must answer cross-origin calls from the web app's origin, as a real identity provider does for a
/// public client. Exact origins only, never a wildcard, never credentials.
/// </summary>
[Collection("SequentialAuth")]
public class MockOidcCorsTests
{
    private const string WebOrigin = "http://localhost:3000";

    private static TestServer CreateServer(params string[] allowedOrigins) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseMockOidcBrowserCors(allowedOrigins);
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer());
            }));

    private static HttpRequestMessage Request(HttpMethod method, string path, string? origin)
    {
        var request = new HttpRequestMessage(method, path);
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    private static string? Header(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues(name, out var values) ? string.Join(",", values) : null;

    [Fact]
    public async Task AnAllowedOriginGetsItselfBackAndVaryOnDiscoveryAndKeys()
    {
        using var server = CreateServer(WebOrigin);
        using var client = server.CreateClient();

        foreach (var path in new[] { "/.well-known/openid-configuration", "/.well-known/jwks.json" })
        {
            var response = await client.SendAsync(Request(HttpMethod.Get, path, WebOrigin));

            Assert.Equal(WebOrigin, Header(response, "Access-Control-Allow-Origin"));
            Assert.Contains("Origin", Header(response, "Vary") ?? "");
        }
    }

    [Fact]
    public async Task TheTokenEndpointAnswersWithTheHeaderEvenWhenTheGrantIsRefused()
    {
        using var server = CreateServer(WebOrigin);
        using var client = server.CreateClient();
        var request = Request(HttpMethod.Post, "/token", WebOrigin);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["grant_type"] = "authorization_code", ["code"] = "nope" });

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); // the browser can only read this error if the header is on it
        Assert.Equal(WebOrigin, Header(response, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task APreflightForTheTokenEndpointIsAnsweredWithoutReachingIt()
    {
        using var server = CreateServer(WebOrigin);
        using var client = server.CreateClient();
        var request = Request(HttpMethod.Options, "/token", WebOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(WebOrigin, Header(response, "Access-Control-Allow-Origin"));
        Assert.Contains("POST", Header(response, "Access-Control-Allow-Methods") ?? "");
        Assert.Contains("content-type", Header(response, "Access-Control-Allow-Headers") ?? "", StringComparison.OrdinalIgnoreCase);
        Assert.NotNull(Header(response, "Access-Control-Max-Age"));
    }

    [Theory]
    [InlineData("http://localhost:3001")]
    [InlineData("https://localhost:3000")]
    [InlineData("http://localhost:3000.evil.example")]
    [InlineData("http://evil.example")]
    [InlineData("http://localhost:3000/")]
    [InlineData("null")]
    public async Task AnyOtherOriginGetsNoCorsHeadersAtAll(string origin)
    {
        using var server = CreateServer(WebOrigin);
        using var client = server.CreateClient();
        var preflight = Request(HttpMethod.Options, "/token", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");

        foreach (var request in new[] { Request(HttpMethod.Get, "/.well-known/jwks.json", origin), preflight })
        {
            var response = await client.SendAsync(request);

            Assert.Null(Header(response, "Access-Control-Allow-Origin"));
            Assert.Null(Header(response, "Access-Control-Allow-Methods"));
        }
    }

    [Fact]
    public async Task ARequestWithoutAnOriginIsUntouched()
    {
        using var server = CreateServer(WebOrigin);
        using var client = server.CreateClient();

        var response = await client.SendAsync(Request(HttpMethod.Get, "/.well-known/jwks.json", origin: null));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(Header(response, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task NeverAWildcardAndNeverCredentials()
    {
        using var server = CreateServer(WebOrigin, "http://localhost:5173");
        using var client = server.CreateClient();

        var response = await client.SendAsync(Request(HttpMethod.Get, "/.well-known/jwks.json", "http://localhost:5173"));

        Assert.Equal("http://localhost:5173", Header(response, "Access-Control-Allow-Origin"));
        Assert.Null(Header(response, "Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task WithNoAllowedOriginsNothingIsAllowed()
    {
        using var server = CreateServer();
        using var client = server.CreateClient();

        var response = await client.SendAsync(Request(HttpMethod.Get, "/.well-known/jwks.json", WebOrigin));

        Assert.Null(Header(response, "Access-Control-Allow-Origin"));
    }

    [Fact]
    public void AnOriginThatIsNotJustSchemeHostAndPortIsRejectedAtStartup()
    {
        foreach (var bad in new[]
                 {
                     "*", "localhost:3000", "http://localhost:3000/path", "http://*.example", "", "http://localhost:3000/",
                     "http://localhost:3000?x=1", "http://user@localhost:3000", "ftp://localhost:3000",
                 })
        {
            Assert.Throws<ArgumentException>(() => CreateServer(bad));
        }
    }
}
