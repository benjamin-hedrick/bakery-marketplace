using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace BakeryMarketplace.Auth.Tests;

/// <summary>
/// Open item 32 and decision D-D (S1-06): the mock issuer's login page must not reflect what it is sent as markup, the redirect it issues must
/// be built safely, and (when it is given a list) it must only ever redirect to a registered redirect_uri, by exact match. Dev-only
/// component, but a real browser app now uses it.
/// </summary>
[Collection("SequentialAuth")]
public partial class MockOidcAuthorizeHardeningTests
{
    private const string Registered = "http://localhost:3000/auth/callback";

    private static TestServer CreateServer(IReadOnlyCollection<string>? redirectUris) =>
        new(new WebHostBuilder()
            .ConfigureServices(services => services.AddRouting())
            .Configure(app =>
            {
                app.UseRouting();
                app.UseEndpoints(endpoints => endpoints.MapMockOidcIssuer("bakery-marketplace", null, redirectUris));
            }));

    private static string AuthorizeUrl(string redirectUri, string state = "s", string challenge = "c", string method = "S256") =>
        "/authorize?response_type=code"
        + $"&redirect_uri={Uri.EscapeDataString(redirectUri)}&state={Uri.EscapeDataString(state)}"
        + $"&code_challenge={Uri.EscapeDataString(challenge)}&code_challenge_method={Uri.EscapeDataString(method)}";

    private static Task<HttpResponseMessage> Submit(HttpClient client, string redirectUri, string state = "s") =>
        client.PostAsync("/authorize/submit", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["userId"] = "user-customer-1",
            ["redirect_uri"] = redirectUri,
            ["state"] = state,
            ["code_challenge"] = "c",
            ["code_challenge_method"] = "S256",
        }));

    [GeneratedRegex("name='(?<name>[a-z_]+)' value='(?<value>[^']*)'")]
    private static partial Regex HiddenInput();

    /// <summary>The value a browser would submit for a hidden input: what is between the quotes, with HTML entities decoded.</summary>
    private static string? Submitted(string html, string name) =>
        HiddenInput().Matches(html).Where(m => m.Groups["name"].Value == name).Select(m => WebUtility.HtmlDecode(m.Groups["value"].Value)).FirstOrDefault();

    // ---- item 32: the login page does not reflect what it is sent --------------------------------------------------------------

    [Theory]
    [InlineData("\"><script>alert(1)</script>")]
    [InlineData("'><img src=x onerror=alert(1)>")]
    [InlineData("</form><script>alert(1)</script>")]
    [InlineData("a&b<c>d\"e'f")]
    public async Task EverythingTheLoginPageEchoesIsEncodedAndStillRoundTripsToTheSameValue(string payload)
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();

        var response = await client.GetAsync(AuthorizeUrl("http://app.test/cb?x=" + payload, payload, payload, payload));
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("<script>alert(1)</script>", html);
        Assert.DoesNotContain("<img", html);
        Assert.DoesNotContain("</form><script", html);
        Assert.Equal("http://app.test/cb?x=" + payload, Submitted(html, "redirect_uri")); // what the form posts back is what was sent
        Assert.Equal(payload, Submitted(html, "state"));
        Assert.Equal(payload, Submitted(html, "code_challenge"));
        Assert.Equal(payload, Submitted(html, "code_challenge_method"));
    }

    [Fact]
    public async Task AnInvalidAuthorizeRequestIsRefusedWithoutEchoingAnything()
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();

        var response = await client.GetAsync("/authorize?response_type=token&redirect_uri=" + Uri.EscapeDataString("<script>alert(1)</script>"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.DoesNotContain("script", await response.Content.ReadAsStringAsync());
    }

    // ---- the redirect that is issued is built, not concatenated -----------------------------------------------------------------

    [Fact]
    public async Task TheStateComesBackExactlyEvenWhenItLooksLikeQueryStringSyntax()
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();
        const string state = "a b&c=d#e?f/g";

        var response = await Submit(client, "http://app.test/cb", state);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var query = System.Web.HttpUtility.ParseQueryString(response.Headers.Location!.Query);
        Assert.Equal(state, query["state"]);
        Assert.Equal(2, query.Count); // only code and state: nothing in the state became another parameter
        Assert.False(string.IsNullOrEmpty(query["code"]));
        Assert.Equal("", response.Headers.Location.Fragment);
    }

    [Fact]
    public async Task ALineBreakInTheStateCannotInjectAHeader()
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();

        var response = await Submit(client, "http://app.test/cb", "x\r\nSet-Cookie: stolen=1");

        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.DoesNotContain("\r", response.Headers.Location!.OriginalString);
        Assert.DoesNotContain("\n", response.Headers.Location.OriginalString);
        Assert.Equal("x\r\nSet-Cookie: stolen=1", System.Web.HttpUtility.ParseQueryString(response.Headers.Location.Query)["state"]);
    }

    [Fact]
    public async Task ARedirectUriThatAlreadyHasAQueryKeepsItAndGetsTheCodeAdded()
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();

        var response = await Submit(client, "http://app.test/cb?tenant=a", "s");

        var query = System.Web.HttpUtility.ParseQueryString(response.Headers.Location!.Query);
        Assert.Equal("a", query["tenant"]);
        Assert.Equal("s", query["state"]);
        Assert.False(string.IsNullOrEmpty(query["code"]));
    }

    [Fact]
    public async Task NoStateIsSentBackWhenNoneWasGiven()
    {
        using var server = CreateServer(redirectUris: null);
        using var client = server.CreateClient();

        var response = await Submit(client, "http://app.test/cb", state: "");

        Assert.DoesNotContain("state", response.Headers.Location!.Query);
    }

    // ---- D-D: only a registered redirect_uri, by exact match --------------------------------------------------------------------

    [Fact]
    public async Task ARegisteredRedirectUriGetsTheLoginPageAndCanCompleteTheWholeFlow()
    {
        using var server = CreateServer([Registered]);
        using var client = server.CreateClient();

        var page = await client.GetAsync(AuthorizeUrl(Registered));
        var redirect = await Submit(client, Registered);

        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Equal(HttpStatusCode.Redirect, redirect.StatusCode);
        Assert.StartsWith(Registered + "?code=", redirect.Headers.Location!.OriginalString);
    }

    [Theory]
    [InlineData("http://evil.example/auth/callback")]
    [InlineData("http://localhost:3000/auth/callback/")]
    [InlineData("http://localhost:3000/auth/callbackx")]
    [InlineData("http://localhost:3000/auth/callback?x=1")]
    [InlineData("http://localhost:3000/auth/callback#frag")]
    [InlineData("http://localhost:3000/auth")]
    [InlineData("https://localhost:3000/auth/callback")]
    [InlineData("HTTP://LOCALHOST:3000/auth/callback")]
    [InlineData("http://localhost:3001/auth/callback")]
    [InlineData("http://localhost:3000.evil.example/auth/callback")]
    [InlineData("//localhost:3000/auth/callback")]
    [InlineData("javascript:alert(1)")]
    public async Task AnyOtherRedirectUriIsRefusedAtBothStepsAndNothingIsReflectedOrIssued(string redirectUri)
    {
        using var server = CreateServer([Registered]);
        using var client = server.CreateClient();

        var page = await client.GetAsync(AuthorizeUrl(redirectUri));
        var submit = await Submit(client, redirectUri);

        Assert.Equal(HttpStatusCode.BadRequest, page.StatusCode);
        Assert.DoesNotContain("evil", await page.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, submit.StatusCode); // the form is client-controlled, so the second step checks again
        Assert.Null(submit.Headers.Location); // and never redirects to an unregistered address
    }

    [Fact]
    public async Task WithNoListAnyRedirectUriIsAcceptedAsBefore_AndWithAnEmptyListNoneIs()
    {
        using var open = CreateServer(redirectUris: null);
        using var openClient = open.CreateClient();
        using var closed = CreateServer([]);
        using var closedClient = closed.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await openClient.GetAsync(AuthorizeUrl("http://anything.test/cb"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await closedClient.GetAsync(AuthorizeUrl(Registered))).StatusCode);
    }

    [Fact]
    public async Task SeveralRegisteredUrisAreEachAcceptedExactly()
    {
        using var server = CreateServer([Registered, "http://localhost:5173/auth/callback"]);
        using var client = server.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(AuthorizeUrl(Registered))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(AuthorizeUrl("http://localhost:5173/auth/callback"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(AuthorizeUrl("http://localhost:5174/auth/callback"))).StatusCode);
    }

    [Theory]
    [InlineData("*")]
    [InlineData("")]
    [InlineData("/relative/callback")]
    [InlineData("localhost:3000/auth/callback")]
    [InlineData("http://localhost:3000/auth/callback#frag")]
    [InlineData("ftp://localhost:3000/auth/callback")]
    [InlineData("http://*.example/auth/callback")]
    [InlineData("http://user:pw@localhost:3000/auth/callback")]
    public void ARegisteredUriThatIsNotAnAbsoluteHttpAddressWithoutFragmentOrCredentialsIsRejectedAtStartup(string bad)
    {
        Assert.Throws<ArgumentException>(() => CreateServer([bad]));
    }

    [Fact]
    public void TheHostDefaultIsTheLocalWebAppsCallback()
    {
        Assert.Equal([Registered], MockOidcIssuer.DefaultRedirectUris);
    }
}
