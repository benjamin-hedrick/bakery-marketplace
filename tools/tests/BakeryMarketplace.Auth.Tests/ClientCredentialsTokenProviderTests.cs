using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using BakeryMarketplace.Secrets;

namespace BakeryMarketplace.Auth.Tests;

public class ClientCredentialsTokenProviderTests
{
    private const string Endpoint = "http://localhost/token";

    private sealed class ManualTime : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 11, 2, 8, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan by) => _now += by;
    }

    private sealed class FakeTokenEndpoint : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        public Func<int, HttpResponseMessage> Respond { get; set; } = n => Ok($"token-{n}", 3600);
        public TimeSpan Delay { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Bodies.Add(await request.Content!.ReadAsStringAsync(cancellationToken));
            if (Delay > TimeSpan.Zero) await Task.Delay(Delay, cancellationToken);
            return Respond(Bodies.Count);
        }
    }

    private static HttpResponseMessage Ok(string token, int expiresIn) =>
        new(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(new { access_token = token, token_type = "Bearer", expires_in = expiresIn }), Encoding.UTF8, "application/json")
        };

    private static HttpResponseMessage Status(HttpStatusCode code, string body) =>
        new(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static ClientCredentialsOptions Options(string? secret = "a-secret-value-for-tests-only", Func<CancellationToken, Task<string>>? assertion = null) => new()
    {
        TokenEndpoint = Endpoint,
        ClientId = "ordering-service",
        Scope = "bakery-marketplace/.default",
        ClientSecret = assertion is null ? secret : null,
        ClientAssertion = assertion,
    };

    private static ClientCredentialsTokenProvider Provider(FakeTokenEndpoint endpoint, ManualTime time, ClientCredentialsOptions? options = null) =>
        new(new HttpClient(endpoint), Microsoft.Extensions.Options.Options.Create(options ?? Options()), time);

    [Fact]
    public async Task RequestsATokenWithTheClientCredentialsGrant()
    {
        var endpoint = new FakeTokenEndpoint();
        var provider = Provider(endpoint, new ManualTime());

        var token = await provider.GetTokenAsync();

        Assert.Equal("token-1", token);
        var form = Uri.UnescapeDataString(endpoint.Bodies.Single());
        Assert.Contains("grant_type=client_credentials", form);
        Assert.Contains("client_id=ordering-service", form);
        Assert.Contains("scope=bakery-marketplace/.default", form);
        Assert.Contains("client_secret=a-secret-value-for-tests-only", form);
    }

    [Fact]
    public async Task ReusesTheTokenUntilJustBeforeItExpires_ThenRefreshes()
    {
        var endpoint = new FakeTokenEndpoint();
        var time = new ManualTime();
        var provider = Provider(endpoint, time);

        Assert.Equal("token-1", await provider.GetTokenAsync());
        time.Advance(TimeSpan.FromMinutes(50));
        Assert.Equal("token-1", await provider.GetTokenAsync());
        Assert.Single(endpoint.Bodies);

        time.Advance(TimeSpan.FromMinutes(9)); // 59 minutes: inside the 2 minute refresh window of a 60 minute token
        Assert.Equal("token-2", await provider.GetTokenAsync());
        Assert.Equal(2, endpoint.Bodies.Count);
    }

    [Fact]
    public async Task ConcurrentCallersShareOneRequest()
    {
        var endpoint = new FakeTokenEndpoint { Delay = TimeSpan.FromMilliseconds(100) };
        var provider = Provider(endpoint, new ManualTime());

        var tokens = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ => provider.GetTokenAsync()));

        Assert.Single(endpoint.Bodies);
        Assert.All(tokens, t => Assert.Equal("token-1", t));
    }

    [Fact]
    public async Task AFailedRefreshUsesTheCachedTokenWhileItIsStillValid_ThenFailsClosed()
    {
        var endpoint = new FakeTokenEndpoint();
        var time = new ManualTime();
        var provider = Provider(endpoint, time);
        await provider.GetTokenAsync();
        endpoint.Respond = _ => Status(HttpStatusCode.ServiceUnavailable, "{}");

        time.Advance(TimeSpan.FromMinutes(59)); // refresh due, token not yet expired
        Assert.Equal("token-1", await provider.GetTokenAsync());

        time.Advance(TimeSpan.FromMinutes(2)); // expired
        await Assert.ThrowsAsync<ServiceTokenException>(() => provider.GetTokenAsync());
    }

    [Fact]
    public async Task ARefusalNamesTheOAuthErrorButNeverTheSecretOrTheBody()
    {
        var secret = TestSecrets.Random();
        var endpoint = new FakeTokenEndpoint
        {
            Respond = _ => Status(HttpStatusCode.BadRequest,
                JsonSerializer.Serialize(new { error = "invalid_client", error_description = $"bad secret {secret} and more detail" }))
        };
        var provider = Provider(endpoint, new ManualTime(), Options(secret));

        var e = await Assert.ThrowsAsync<ServiceTokenException>(() => provider.GetTokenAsync());

        Assert.Contains("invalid_client", e.Message);
        Assert.Contains("400", e.Message);
        Assert.DoesNotContain(secret, e.Message);
        Assert.DoesNotContain("more detail", e.Message);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("{\"access_token\":\"\",\"token_type\":\"Bearer\",\"expires_in\":3600}")]
    [InlineData("{\"access_token\":\"t\",\"token_type\":\"mac\",\"expires_in\":3600}")]
    [InlineData("{\"access_token\":\"t\",\"token_type\":\"Bearer\",\"expires_in\":0}")]
    public async Task AnUnusableResponseIsRejected(string body)
    {
        var endpoint = new FakeTokenEndpoint { Respond = _ => Status(HttpStatusCode.OK, body) };
        var provider = Provider(endpoint, new ManualTime());

        await Assert.ThrowsAsync<ServiceTokenException>(() => provider.GetTokenAsync());
    }

    [Fact]
    public async Task AnUnreachableEndpointIsAServiceTokenException()
    {
        var endpoint = new FakeTokenEndpoint { Respond = _ => throw new HttpRequestException("connection refused") };
        var provider = Provider(endpoint, new ManualTime());

        var e = await Assert.ThrowsAsync<ServiceTokenException>(() => provider.GetTokenAsync());

        Assert.IsType<HttpRequestException>(e.InnerException);
    }

    [Fact]
    public async Task ACallerCancellationIsNotWrapped()
    {
        var endpoint = new FakeTokenEndpoint { Delay = TimeSpan.FromSeconds(5) };
        var provider = Provider(endpoint, new ManualTime());
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => provider.GetTokenAsync(cts.Token));
    }

    [Fact]
    public async Task ASuppliedAssertionIsSentInsteadOfASecret()
    {
        var endpoint = new FakeTokenEndpoint();
        var provider = Provider(endpoint, new ManualTime(), Options(assertion: _ => Task.FromResult("signed.assertion.jwt")));

        await provider.GetTokenAsync();

        var form = Uri.UnescapeDataString(endpoint.Bodies.Single());
        Assert.Contains("client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer", form);
        Assert.Contains("client_assertion=signed.assertion.jwt", form);
        Assert.DoesNotContain("client_secret", form);
    }

    [Fact]
    public async Task TheHandlerAddsTheBearerToken()
    {
        var provider = Provider(new FakeTokenEndpoint(), new ManualTime());
        var seen = new List<string?>();
        var inner = new CapturingHandler(r => seen.Add(r.Headers.Authorization?.ToString()));
        var handler = new ClientCredentialsHandler(provider) { InnerHandler = inner };
        using var client = new HttpClient(handler);

        await client.GetAsync("http://localhost/anything");

        Assert.Equal(["Bearer token-1"], seen);
    }

    private sealed class CapturingHandler(Action<HttpRequestMessage> capture) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            capture(request);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        }
    }

    // ---- configuration guards ----------------------------------------------------------------------------------------

    [Theory]
    [InlineData("http://auth.example.com/token", false)] // a secret never travels over plain http to a remote host
    [InlineData("https://auth.example.com/token", true)]
    [InlineData("http://localhost:5100/token", true)] // the local mock issuer
    [InlineData("http://127.0.0.1:5100/token", true)]
    [InlineData("/relative", false)] // parses as a file:// URI on Linux, so it must be refused by scheme, not by parsing
    [InlineData("file:///etc/token", false)]
    [InlineData("ftp://localhost/token", false)]
    [InlineData("https://localhost/token", true)]
    public void TheTokenEndpointMustBeHttpsUnlessLoopback(string endpoint, bool allowed)
    {
        var options = Options();
        options.TokenEndpoint = endpoint;

        if (allowed) Provider(new FakeTokenEndpoint(), new ManualTime(), options);
        else Assert.Throws<InvalidOperationException>(() => Provider(new FakeTokenEndpoint(), new ManualTime(), options));
    }

    [Fact]
    public void ExactlyOneCredentialMustBeConfigured()
    {
        var neither = Options(secret: null);
        var both = Options();
        both.ClientAssertion = _ => Task.FromResult("a");

        Assert.Throws<InvalidOperationException>(() => Provider(new FakeTokenEndpoint(), new ManualTime(), neither));
        Assert.Throws<InvalidOperationException>(() => Provider(new FakeTokenEndpoint(), new ManualTime(), both));
    }

    [Fact]
    public void ClientIdAndScopeAreRequired()
    {
        var noId = Options();
        noId.ClientId = " ";
        var noScope = Options();
        noScope.Scope = "";

        Assert.Throws<InvalidOperationException>(() => Provider(new FakeTokenEndpoint(), new ManualTime(), noId));
        Assert.Throws<InvalidOperationException>(() => Provider(new FakeTokenEndpoint(), new ManualTime(), noScope));
    }

    private static IConfiguration Config(Dictionary<string, string?> values) => new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> FullConfig() => new()
    {
        ["ServiceAuth:TokenEndpoint"] = "http://localhost:5100/token",
        ["ServiceAuth:ClientId"] = "ordering-service",
        ["ServiceAuth:Scope"] = "bakery-marketplace/.default",
        ["ServiceAuth:ClientSecret"] = "a-secret-value-for-tests-only",
    };

    [Fact]
    public void AddBakeryServiceAuth_ResolvesASingletonProviderFromConfiguration()
    {
        var services = new ServiceCollection();
        services.AddBakeryServiceAuth(Config(FullConfig()));
        using var sp = services.BuildServiceProvider();

        var first = sp.GetRequiredService<ClientCredentialsTokenProvider>();
        var second = sp.GetRequiredService<ClientCredentialsTokenProvider>();

        Assert.Same(first, second);
        Assert.NotNull(sp.GetRequiredService<ClientCredentialsHandler>());
    }

    [Theory]
    [InlineData("ServiceAuth:TokenEndpoint")]
    [InlineData("ServiceAuth:ClientId")]
    [InlineData("ServiceAuth:Scope")]
    [InlineData("ServiceAuth:ClientSecret")]
    public void AddBakeryServiceAuth_StopsTheServiceAtStartupWhenAValueIsMissing(string missing)
    {
        var values = FullConfig();
        values.Remove(missing);

        var e = Assert.Throws<SecretValidationException>(() => new ServiceCollection().AddBakeryServiceAuth(Config(values)));

        Assert.Contains(missing, e.Message);
    }

    [Theory]
    [InlineData("http://auth.example.com/token")] // plain http to a remote host
    [InlineData("/relative")]
    [InlineData("file:///etc/token")]
    [InlineData("ftp://localhost/token")]
    public void AddBakeryServiceAuth_RefusesAnUnsafeTokenEndpointAtStartup_NotAtFirstUse(string endpoint)
    {
        var values = FullConfig();
        values["ServiceAuth:TokenEndpoint"] = endpoint;

        // Which guard fires first depends on the platform: "/relative" is not an absolute URI on Windows (SecretValidator refuses it) but is a
        // file:// URI on Linux (our scheme check refuses it). Either way, registration fails.
        var e = Record.Exception(() => new ServiceCollection().AddBakeryServiceAuth(Config(values)));
        Assert.True(e is SecretValidationException or InvalidOperationException, e?.GetType().Name ?? "no exception");
    }

    [Fact]
    public void AddBakeryServiceAuth_RefusesATokenEndpointThatIsNotAUrl()
    {
        var values = FullConfig();
        values["ServiceAuth:TokenEndpoint"] = "not a url";

        Assert.Throws<SecretValidationException>(() => new ServiceCollection().AddBakeryServiceAuth(Config(values)));
    }
}
