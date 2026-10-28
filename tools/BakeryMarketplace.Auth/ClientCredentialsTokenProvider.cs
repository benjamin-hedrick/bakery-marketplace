using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Settings for calling another service as a service (ADR-0018). Exactly one of <see cref="ClientSecret"/> and
/// <see cref="ClientAssertion"/> must be set: the secret is for local development and for a Key Vault secret; the assertion
/// supplier is for a federated identity credential (a signed token from the platform instead of a stored secret).
/// </summary>
public sealed class ClientCredentialsOptions
{
    public string TokenEndpoint { get; set; } = "";
    public string ClientId { get; set; } = "";

    /// <summary>The requested scope, in the Entra form <c>&lt;audience&gt;/.default</c>. The granted roles come from the client's registration.</summary>
    public string Scope { get; set; } = "";

    public string? ClientSecret { get; set; }

    /// <summary>Returns a fresh signed client assertion (a JWT) on each call.</summary>
    public Func<CancellationToken, Task<string>>? ClientAssertion { get; set; }

    /// <summary>A cached token is replaced this long before it expires.</summary>
    public TimeSpan RefreshSkew { get; set; } = TimeSpan.FromMinutes(2);

    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(10);
}

/// <summary>A token could not be obtained. The message never contains the secret, an assertion or a response body.</summary>
public sealed class ServiceTokenException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>
/// Gets and caches an access token with the OAuth2 client credentials grant (RFC 6749 section 4.4). One instance per client, shared:
/// the token is reused until shortly before it expires, and only one refresh runs at a time. It fails closed: if no token can be
/// obtained and the cached one has expired it throws, and there is no other source of tokens. If a refresh fails while the cached
/// token is still valid, the cached token is used.
/// </summary>
public sealed class ClientCredentialsTokenProvider
{
    private readonly HttpClient _http;
    private readonly ClientCredentialsOptions _options;
    private readonly TimeProvider _time;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private volatile CachedToken? _cached;

    private sealed record CachedToken(string Value, DateTimeOffset RefreshAt, DateTimeOffset ExpiresAt);

    public ClientCredentialsTokenProvider(HttpClient http, IOptions<ClientCredentialsOptions> options, TimeProvider? time = null)
    {
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _options = options?.Value ?? throw new ArgumentNullException(nameof(options));
        _time = time ?? TimeProvider.System;
        Validate(_options);
    }

    public async Task<string> GetTokenAsync(CancellationToken ct = default)
    {
        if (_cached is { } fresh && _time.GetUtcNow() < fresh.RefreshAt) return fresh.Value;

        await _gate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_cached is { } again && _time.GetUtcNow() < again.RefreshAt) return again.Value;
            try
            {
                var token = await RequestAsync(ct).ConfigureAwait(false);
                _cached = token;
                return token.Value;
            }
            catch (ServiceTokenException) when (_cached is { } stale && _time.GetUtcNow() < stale.ExpiresAt)
            {
                return stale.Value;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<CachedToken> RequestAsync(CancellationToken ct)
    {
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = _options.ClientId,
            ["scope"] = _options.Scope,
        };
        if (_options.ClientAssertion is { } assertion)
        {
            form["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
            form["client_assertion"] = await assertion(ct).ConfigureAwait(false);
        }
        else
        {
            form["client_secret"] = _options.ClientSecret!;
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(_options.RequestTimeout);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, _options.TokenEndpoint) { Content = new FormUrlEncodedContent(form) };
            using var response = await _http.SendAsync(request, timeout.Token).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new ServiceTokenException($"The token endpoint refused the request (HTTP {(int)response.StatusCode}, error '{ErrorCode(body)}').");
            }
            return Parse(body);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            throw new ServiceTokenException("The token endpoint could not be reached or did not answer in time.", e);
        }
    }

    private CachedToken Parse(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var token = root.GetProperty("access_token").GetString();
            var type = root.TryGetProperty("token_type", out var t) ? t.GetString() : "Bearer";
            var seconds = root.GetProperty("expires_in").GetInt32();
            if (string.IsNullOrWhiteSpace(token) || !string.Equals(type, "Bearer", StringComparison.OrdinalIgnoreCase) || seconds <= 0)
            {
                throw new ServiceTokenException("The token endpoint returned an unusable token response.");
            }

            var now = _time.GetUtcNow();
            var lifetime = TimeSpan.FromSeconds(seconds);
            // Refresh early, but never so early that a short-lived token is refreshed on every call.
            var refreshAfter = lifetime - _options.RefreshSkew > lifetime / 2 ? lifetime - _options.RefreshSkew : lifetime / 2;
            return new CachedToken(token, now + refreshAfter, now + lifetime);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        {
            throw new ServiceTokenException("The token endpoint returned a response that is not a valid token response.");
        }
    }

    /// <summary>Only the OAuth2 error code, reduced to safe characters; the rest of the body is never copied into a message.</summary>
    private static string ErrorCode(string body)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            var code = doc.RootElement.TryGetProperty("error", out var e) ? e.GetString() ?? "" : "";
            var safe = new string(code.Where(c => char.IsLetterOrDigit(c) || c == '_').Take(40).ToArray());
            return safe.Length == 0 ? "unknown" : safe;
        }
        catch (JsonException)
        {
            return "unknown";
        }
    }

    internal static void Validate(ClientCredentialsOptions o)
    {
        // Only http(s). On Linux a string like "/relative" parses as an absolute file:// URI (and a file URI counts as loopback), so the
        // scheme has to be checked explicitly rather than trusting UriKind.Absolute.
        if (!Uri.TryCreate(o.TokenEndpoint, UriKind.Absolute, out var endpoint)
            || (endpoint.Scheme != Uri.UriSchemeHttps && endpoint.Scheme != Uri.UriSchemeHttp))
            throw new InvalidOperationException("ServiceAuth:TokenEndpoint must be an absolute http(s) URL.");
        // A secret or assertion is only ever sent over TLS, except to a loopback address (the local mock issuer).
        if (endpoint.Scheme != Uri.UriSchemeHttps && !endpoint.IsLoopback)
            throw new InvalidOperationException("ServiceAuth:TokenEndpoint must use https unless it is a loopback address.");
        if (string.IsNullOrWhiteSpace(o.ClientId)) throw new InvalidOperationException("ServiceAuth:ClientId is required.");
        if (string.IsNullOrWhiteSpace(o.Scope)) throw new InvalidOperationException("ServiceAuth:Scope is required.");
        var hasSecret = !string.IsNullOrWhiteSpace(o.ClientSecret);
        var hasAssertion = o.ClientAssertion is not null;
        if (hasSecret == hasAssertion)
            throw new InvalidOperationException("Set exactly one of ServiceAuth:ClientSecret and a client assertion supplier.");
    }
}

/// <summary>Adds the current service token as a bearer token to every outgoing request of an <see cref="HttpClient"/>.</summary>
public sealed class ClientCredentialsHandler(ClientCredentialsTokenProvider provider) : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = await provider.GetTokenAsync(cancellationToken).ConfigureAwait(false);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
    }
}
