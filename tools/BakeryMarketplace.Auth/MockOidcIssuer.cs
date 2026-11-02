using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BakeryMarketplace.Auth;

/// <summary>
/// Implements a local mock OIDC issuer for dev/testing.
/// Provides endpoints for discovery, JWKS, authorization (mock UI), and token minting with PKCE support (WI-AUTH-005), and an
/// OAuth2 client credentials grant for registered service clients (ADR-0018, WI-AUTH-006).
/// </summary>
public static class MockOidcIssuer
{
    private static readonly RSA RsaKey = RSA.Create(2048);
    private static readonly RsaSecurityKey SecurityKey = new RsaSecurityKey(RsaKey) { KeyId = "mock-key-1" };

    // In-memory store for authorization codes
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, AuthCodeData> AuthCodes = new();

    private record AuthCodeData(
        string UserId, string RedirectUri, string? CodeChallenge, string? CodeChallengeMethod, DateTimeOffset ExpiresAt, string? ClientId = null, string Scope = "");

    // Refresh tokens (ADR-0019). Opaque, single use, rotated on every use, and grouped in a family per login: presenting a token that was already
    // used revokes the whole family, because a second use means two parties hold it (the real issuers do the same). In memory, like the codes.
    private sealed class RefreshTokenData(string userId, string familyId, string? clientId, string scope, DateTimeOffset expiresAt)
    {
        public string UserId { get; } = userId;
        public string FamilyId { get; } = familyId;
        public string? ClientId { get; } = clientId;
        public string Scope { get; } = scope;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public bool Used { get; set; }
    }

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, RefreshTokenData> RefreshTokens = new();
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> RevokedFamilies = new();

    /// <summary>How long a refresh token lives when the host does not say (it is renewed each time it is used).</summary>
    public static readonly TimeSpan DefaultRefreshTokenLifetime = TimeSpan.FromHours(8);

    /// <summary>The scope that asks for a refresh token.</summary>
    public const string OfflineAccessScope = "offline_access";

    private static bool HasScope(string scope, string wanted) =>
        scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(wanted, StringComparer.Ordinal);

    private static string NewRefreshToken() => Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    /// <summary>Encodes a value for HTML text and quoted attributes, so nothing the page is sent can become markup.</summary>
    private static string Html(string? value) => System.Net.WebUtility.HtmlEncode(value ?? "");

    /// <summary>
    /// The server-side callbacks of the two local web apps (the customer app on port 3000, the queue display on 3100; ADR-0019), used by the runnable
    /// host unless it is configured otherwise.
    /// </summary>
    public static readonly string[] DefaultRedirectUris = ["http://localhost:3000/api/auth/callback", "http://localhost:3100/api/auth/callback"];

    /// <summary>A registered redirect_uri is an absolute http(s) address with no fragment, no credentials and no wildcard.</summary>
    private static string ValidateRedirectUri(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || value.Contains('#') || uri.UserInfo.Length > 0)
        {
            throw new ArgumentException($"'{value}' is not a redirect URI (an absolute http or https address without a fragment or credentials).", nameof(value));
        }
        return value;
    }

    private static string ValidateIssuer(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || !string.IsNullOrEmpty(uri.Fragment) || !string.IsNullOrEmpty(uri.UserInfo))
        {
            throw new ArgumentException($"'{value}' is not an issuer URL (an absolute http or https address without a fragment or credentials).", nameof(value));
        }
        return value.TrimEnd('/');
    }

    /// <summary>
    /// Maps the mock OIDC endpoints to the given route builder.
    /// </summary>
    /// <param name="endpoints">The route builder</param>
    /// <param name="audience">The audience claim to put in tokens, defaults to 'bakery-marketplace'</param>
    /// <param name="clients">
    /// Service clients allowed to use the client credentials grant. With none registered the grant refuses every request.
    /// A client's secret must be at least <see cref="MockClient.MinimumSecretLength"/> characters.
    /// </param>
    /// <param name="redirectUris">
    /// The redirect_uri values the login flow may send a browser back to, each an absolute http(s) address compared EXACTLY (no prefix, case or
    /// trailing-slash leniency) and never redirected to otherwise. Null accepts any address (the library default, for tests); the runnable host
    /// passes <see cref="DefaultRedirectUris"/> or its configuration, and an empty list refuses every login.
    /// </param>
    /// <param name="issuer">
    /// A fixed issuer URL for the <c>iss</c> claim and the discovery document's <c>issuer</c>, as a real tenant has. Null derives it from the request's
    /// host (the default), which only works while every client reaches the issuer by the same address. The endpoint URLs in the discovery
    /// document always follow the request, so a client that fetches metadata by another address (a container network) still gets reachable endpoints.
    /// </param>
    /// <param name="allowedRoles">
    /// Roles whose mock users may log in. Null (the default) allows all of them. The deployed dev environment passes only Customer.
    /// </param>
    /// <param name="refreshTokenLifetime">
    /// How long a refresh token lives (ADR-0019); each use renews it. A refresh token is issued only to a login that asked for the
    /// <c>offline_access</c> scope. Defaults to <see cref="DefaultRefreshTokenLifetime"/>.
    /// </param>
    /// <param name="timeProvider">The clock for refresh token expiry; tests pass a fake one.</param>
    public static IEndpointRouteBuilder MapMockOidcIssuer(
        this IEndpointRouteBuilder endpoints,
        string audience = "bakery-marketplace",
        IReadOnlyCollection<MockClient>? clients = null,
        IReadOnlyCollection<string>? redirectUris = null,
        string? issuer = null,
        IReadOnlyCollection<string>? allowedRoles = null,
        TimeSpan? refreshTokenLifetime = null,
        TimeProvider? timeProvider = null)
    {
        var refreshLifetime = refreshTokenLifetime ?? DefaultRefreshTokenLifetime;
        if (refreshLifetime <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(refreshTokenLifetime), "A refresh token must live for a positive time.");
        var clock = timeProvider ?? TimeProvider.System;
        // Null offers every mock user (local use). A list offers only users whose role is in it, on the login page AND at submit, so a user
        // outside the list cannot be asked for by posting its id (deployed dev environment, MockOidcDeployment).
        var roleFilter = allowedRoles?.ToHashSet(StringComparer.OrdinalIgnoreCase);
        bool UserAllowed(MockUser u) => roleFilter is null || roleFilter.Contains(u.Role);
        var fixedIssuer = issuer is null ? null : ValidateIssuer(issuer);
        string IssuerFor(string requestBase) => fixedIssuer ?? requestBase;
        var registeredClients = (clients ?? Array.Empty<MockClient>()).ToDictionary(c => c.ClientId, StringComparer.Ordinal);
        foreach (var client in registeredClients.Values) client.Validate();
        var allowedRedirects = redirectUris?.Select(ValidateRedirectUri).ToHashSet(StringComparer.Ordinal);
        bool RedirectAllowed(string redirectUri) => allowedRedirects is null || allowedRedirects.Contains(redirectUri);

        endpoints.MapGet("/.well-known/openid-configuration", (HttpRequest request) =>
        {
            var baseUrl = $"{request.Scheme}://{request.Host}{request.PathBase}";
            return Results.Ok(new
            {
                issuer = IssuerFor(baseUrl),
                jwks_uri = $"{baseUrl}/.well-known/jwks.json",
                authorization_endpoint = $"{baseUrl}/authorize",
                token_endpoint = $"{baseUrl}/token",
                response_types_supported = new[] { "code" },
                subject_types_supported = new[] { "public" },
                id_token_signing_alg_values_supported = new[] { "RS256" },
                code_challenge_methods_supported = new[] { "plain", "S256" },
                grant_types_supported = new[] { "authorization_code", "client_credentials", "refresh_token" },
                scopes_supported = new[] { "openid", OfflineAccessScope },
                token_endpoint_auth_methods_supported = new[] { "none", "client_secret_basic", "client_secret_post" }
            });
        });

        endpoints.MapGet("/.well-known/jwks.json", () =>
        {
            var parameters = RsaKey.ExportParameters(false);
            return Results.Ok(new
            {
                keys = new[]
                {
                    new
                    {
                        kty = "RSA",
                        use = "sig",
                        kid = SecurityKey.KeyId,
                        alg = "RS256",
                        n = Base64UrlEncoder.Encode(parameters.Modulus),
                        e = Base64UrlEncoder.Encode(parameters.Exponent)
                    }
                }
            });
        });

        endpoints.MapGet("/authorize", (HttpRequest request, string? client_id, string? redirect_uri, string? response_type, string? state, string? code_challenge, string? code_challenge_method, string? scope) =>
        {
            // The refusal text is fixed: nothing the caller sent is echoed back, and an unregistered address is never redirected to.
            if (string.IsNullOrEmpty(redirect_uri) || response_type != "code" || !RedirectAllowed(redirect_uri))
            {
                return Results.BadRequest("Invalid authorize request. Expected response_type=code and a registered redirect_uri.");
            }

            var html = $@"
<!DOCTYPE html>
<html>
<head>
    <title>Mock OIDC Login</title>
    <style>
        body {{ font-family: sans-serif; padding: 20px; }}
        ul {{ list-style-type: none; padding: 0; }}
        li {{ margin-bottom: 10px; }}
        button {{ padding: 8px 16px; font-size: 16px; cursor: pointer; }}
    </style>
</head>
<body>
    <h1>Mock OIDC Login</h1>
    <p>Select a user to login:</p>
    <ul>
        {string.Join("\n", MockUsers.All.Values.Distinct().Where(UserAllowed).Select(u => $@"
            <li>
                <form method='POST' action='{Html(request.PathBase.Value)}/authorize/submit'>
                    <input type='hidden' name='userId' value='{Html(u.Id)}' />
                    <input type='hidden' name='redirect_uri' value='{Html(redirect_uri)}' />
                    <input type='hidden' name='state' value='{Html(state)}' />
                    <input type='hidden' name='code_challenge' value='{Html(code_challenge)}' />
                    <input type='hidden' name='code_challenge_method' value='{Html(code_challenge_method)}' />
                    <input type='hidden' name='client_id' value='{Html(client_id)}' />
                    <input type='hidden' name='scope' value='{Html(scope)}' />
                    <button type='submit'>Login as {Html(u.Name)} ({Html(u.Role)})</button>
                </form>
            </li>
        "))}
    </ul>
</body>
</html>";
            return Results.Content(html, "text/html");
        });

        endpoints.MapPost("/authorize/submit", (HttpRequest request) =>
        {
            var form = request.Form;
            var userId = form["userId"].ToString();
            var redirectUri = form["redirect_uri"].ToString();
            var state = form["state"].ToString();
            var codeChallenge = form["code_challenge"].ToString();
            var codeChallengeMethod = form["code_challenge_method"].ToString();
            var loginClientId = form["client_id"].ToString();
            var loginScope = form["scope"].ToString();

            if (!MockUsers.All.TryGetValue(userId, out var user) || !UserAllowed(user))
            {
                return Results.BadRequest("Invalid user.");
            }

            // The form is client-controlled, so the address is checked again here, before any code exists for it.
            if (string.IsNullOrEmpty(redirectUri) || !RedirectAllowed(redirectUri))
            {
                return Results.BadRequest("Invalid authorize request. Expected a registered redirect_uri.");
            }

            var code = Guid.NewGuid().ToString("N");
            AuthCodes[code] = new AuthCodeData(
                userId, redirectUri, codeChallenge, codeChallengeMethod, DateTimeOffset.UtcNow.AddMinutes(5),
                string.IsNullOrEmpty(loginClientId) ? null : loginClientId, loginScope);

            // Built with proper query-string encoding: a state like "a&code=x" or one with a line break is data, never syntax.
            var redirectUrl = Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(redirectUri, "code", code);
            if (!string.IsNullOrEmpty(state))
            {
                redirectUrl = Microsoft.AspNetCore.WebUtilities.QueryHelpers.AddQueryString(redirectUrl, "state", state);
            }

            return Results.Redirect(redirectUrl);
        }).DisableAntiforgery();

        endpoints.MapPost("/token", async (HttpRequest request) =>
        {
            var form = await request.ReadFormAsync();
            var grantType = form["grant_type"].ToString();
            var baseUrl = $"{request.Scheme}://{request.Host}{request.PathBase}";

            if (grantType == "authorization_code")
            {
                var code = form["code"].ToString();
                var redirectUri = form["redirect_uri"].ToString();
                var codeVerifier = form["code_verifier"].ToString();

                if (!AuthCodes.TryGetValue(code, out var authCodeData) || authCodeData.ExpiresAt < DateTimeOffset.UtcNow)
                {
                    return Results.BadRequest(new { error = "invalid_grant", error_description = "Invalid or expired code." });
                }

                if (authCodeData.RedirectUri != redirectUri)
                {
                    return Results.BadRequest(new { error = "invalid_grant", error_description = "Redirect URI mismatch." });
                }

                if (!string.IsNullOrEmpty(authCodeData.CodeChallenge))
                {
                    if (authCodeData.CodeChallengeMethod == "S256")
                    {
                        using var sha256 = SHA256.Create();
                        var hash = sha256.ComputeHash(Encoding.ASCII.GetBytes(codeVerifier));
                        var expectedChallenge = Base64UrlEncoder.Encode(hash);
                        if (expectedChallenge != authCodeData.CodeChallenge)
                        {
                            return Results.BadRequest(new { error = "invalid_grant", error_description = "PKCE verification failed." });
                        }
                    }
                    else if (authCodeData.CodeChallengeMethod == "plain" || string.IsNullOrEmpty(authCodeData.CodeChallengeMethod))
                    {
                        if (codeVerifier != authCodeData.CodeChallenge)
                        {
                            return Results.BadRequest(new { error = "invalid_grant", error_description = "PKCE verification failed." });
                        }
                    }
                }

                AuthCodes.TryRemove(code, out _);

                var user = MockUsers.All[authCodeData.UserId];
                string? refreshToken = null;
                if (HasScope(authCodeData.Scope, OfflineAccessScope))
                {
                    refreshToken = NewRefreshToken();
                    RefreshTokens[refreshToken] = new RefreshTokenData(
                        user.Id, Guid.NewGuid().ToString("N"), authCodeData.ClientId, authCodeData.Scope, clock.GetUtcNow().Add(refreshLifetime));
                }
                var tokenResponse = GenerateTokens(user, IssuerFor(baseUrl), audience, refreshToken, authCodeData.Scope);
                return Results.Json(tokenResponse);
            }
            else if (grantType == "refresh_token")
            {
                return RefreshTokenGrant(form, IssuerFor(baseUrl), audience, UserAllowed, clock, refreshLifetime);
            }
            else if (grantType == "client_credentials")
            {
                return ClientCredentialsGrant(request, form, registeredClients, IssuerFor(baseUrl), audience);
            }

            return Results.BadRequest(new { error = "unsupported_grant_type" });
        });

        return endpoints;
    }

    // ---- refresh tokens (ADR-0019) ---------------------------------------------------------------------------------------

    private static IResult InvalidGrant(string description) =>
        Results.Json(new { error = "invalid_grant", error_description = description }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult RefreshTokenGrant(
        IFormCollection form, string issuer, string audience, Func<MockUser, bool> userAllowed, TimeProvider clock, TimeSpan lifetime)
    {
        var presented = form["refresh_token"].ToString();
        var clientId = form["client_id"].ToString();
        if (string.IsNullOrEmpty(presented) || !RefreshTokens.TryGetValue(presented, out var data))
        {
            return InvalidGrant("Unknown refresh token.");
        }

        lock (data)
        {
            if (RevokedFamilies.ContainsKey(data.FamilyId))
            {
                return InvalidGrant("The refresh token has been revoked.");
            }

            if (data.Used)
            {
                // A second use of a rotated token: two parties hold it, so nothing from this login can be trusted any more.
                RevokedFamilies[data.FamilyId] = 0;
                return InvalidGrant("The refresh token was already used; the login has been revoked.");
            }

            if (clock.GetUtcNow() >= data.ExpiresAt)
            {
                return InvalidGrant("The refresh token has expired.");
            }

            if (!string.IsNullOrEmpty(clientId) && data.ClientId is not null && !string.Equals(clientId, data.ClientId, StringComparison.Ordinal))
            {
                return InvalidGrant("The refresh token was issued to another client.");
            }

            // The user and their roles come from the registry now, never from the request: a refresh cannot widen the original login.
            if (!MockUsers.All.TryGetValue(data.UserId, out var user) || !userAllowed(user))
            {
                return InvalidGrant("The user may no longer log in.");
            }

            data.Used = true;
            var next = NewRefreshToken();
            RefreshTokens[next] = new RefreshTokenData(data.UserId, data.FamilyId, data.ClientId, data.Scope, clock.GetUtcNow().Add(lifetime));
            return Results.Json(GenerateTokens(user, issuer, audience, next, data.Scope));
        }
    }

    // ---- client credentials (ADR-0018) ------------------------------------------------------------------------------------

    private static IResult ClientCredentialsGrant(
        HttpRequest request, IFormCollection form, IReadOnlyDictionary<string, MockClient> registered, string issuer, string defaultAudience)
    {
        var (clientId, secret, viaHeader) = ReadClientCredentials(request, form);
        registered.TryGetValue(clientId ?? "", out var client);

        // Always compare something, so an unknown client id and a wrong secret cost the same.
        var expected = client?.Secret ?? "unregistered-client";
        var matches = SecretsEqual(secret ?? "", expected);
        if (client is null || !matches)
        {
            return InvalidClient(request, viaHeader);
        }

        var allowedAudience = client.Audience ?? defaultAudience;
        var requestedAudience = RequestedAudience(form["scope"].ToString()) ?? allowedAudience;
        if (!string.Equals(requestedAudience, allowedAudience, StringComparison.Ordinal))
        {
            return Results.Json(new { error = "invalid_scope", error_description = "That audience is not allowed for this client." },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, client.ClientId),
            new("client_id", client.ClientId),
            new("idtyp", "app"),
        };
        claims.AddRange(client.Roles.Select(role => new Claim("roles", role)));

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: allowedAudience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(SecurityKey, SecurityAlgorithms.RsaSha256));

        // No id_token and no user claims: this is an app-only token.
        return Results.Ok(new
        {
            access_token = new JwtSecurityTokenHandler().WriteToken(token),
            token_type = "Bearer",
            expires_in = 3600
        });
    }

    private static (string? ClientId, string? Secret, bool ViaHeader) ReadClientCredentials(HttpRequest request, IFormCollection form)
    {
        var authorization = request.Headers.Authorization.ToString();
        if (authorization.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(authorization[6..].Trim()));
                var colon = decoded.IndexOf(':');
                if (colon > 0)
                {
                    // RFC 6749 section 2.3.1: both parts are form-urlencoded before the base64 step.
                    return (Unescape(decoded[..colon]), Unescape(decoded[(colon + 1)..]), true);
                }
            }
            catch (FormatException)
            {
                // fall through: treated as no credentials
            }
            return (null, null, true);
        }

        return (form["client_id"].ToString(), form["client_secret"].ToString(), false);
    }

    private static string Unescape(string value) => Uri.UnescapeDataString(value.Replace('+', ' '));

    /// <summary>"api://catalog/.default" and "bakery-marketplace" both mean the audience before any "/.default" suffix.</summary>
    private static string? RequestedAudience(string scope)
    {
        var first = scope.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (first is null) return null;
        return first.EndsWith("/.default", StringComparison.Ordinal) ? first[..^"/.default".Length] : first;
    }

    private static bool SecretsEqual(string supplied, string expected) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(supplied)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

    private static IResult InvalidClient(HttpRequest request, bool viaHeader)
    {
        // RFC 6749 section 5.2: 401 with a challenge when the client authenticated through the Authorization header, otherwise 400.
        if (viaHeader)
        {
            request.HttpContext.Response.Headers.WWWAuthenticate = "Basic realm=\"mock-oidc\"";
            return Results.Json(new { error = "invalid_client" }, statusCode: StatusCodes.Status401Unauthorized);
        }
        return Results.Json(new { error = "invalid_client" }, statusCode: StatusCodes.Status400BadRequest);
    }

    private static Dictionary<string, object> GenerateTokens(MockUser user, string issuer, string audience, string? refreshToken = null, string? scope = null)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")), // a unique id per token, as real issuers give: two tokens never match
            new Claim(JwtRegisteredClaimNames.Name, user.Name),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("roles", user.Role)
        };

        if (!string.IsNullOrEmpty(user.VendorType))
        {
            claims.Add(new Claim("vendorType", user.VendorType));
        }

        var key = SecurityKey;
        var creds = new SigningCredentials(key, SecurityAlgorithms.RsaSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds
        );

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);

        var response = new Dictionary<string, object>
        {
            ["access_token"] = accessToken,
            ["id_token"] = accessToken, // Simplification for mock
            ["token_type"] = "Bearer",
            ["expires_in"] = 3600,
        };
        if (refreshToken is not null) response["refresh_token"] = refreshToken;
        if (!string.IsNullOrWhiteSpace(scope)) response["scope"] = scope;
        return response;
    }
}
