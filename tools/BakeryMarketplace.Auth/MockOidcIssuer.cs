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

    private record AuthCodeData(string UserId, string RedirectUri, string? CodeChallenge, string? CodeChallengeMethod, DateTimeOffset ExpiresAt);

    /// <summary>
    /// Maps the mock OIDC endpoints to the given route builder.
    /// </summary>
    /// <param name="endpoints">The route builder</param>
    /// <param name="audience">The audience claim to put in tokens, defaults to 'bakery-marketplace'</param>
    /// <param name="clients">
    /// Service clients allowed to use the client credentials grant. With none registered the grant refuses every request.
    /// A client's secret must be at least <see cref="MockClient.MinimumSecretLength"/> characters.
    /// </param>
    public static IEndpointRouteBuilder MapMockOidcIssuer(
        this IEndpointRouteBuilder endpoints, string audience = "bakery-marketplace", IReadOnlyCollection<MockClient>? clients = null)
    {
        var registeredClients = (clients ?? Array.Empty<MockClient>()).ToDictionary(c => c.ClientId, StringComparer.Ordinal);
        foreach (var client in registeredClients.Values) client.Validate();

        endpoints.MapGet("/.well-known/openid-configuration", (HttpRequest request) =>
        {
            var baseUrl = $"{request.Scheme}://{request.Host}{request.PathBase}";
            return Results.Ok(new
            {
                issuer = baseUrl,
                jwks_uri = $"{baseUrl}/.well-known/jwks.json",
                authorization_endpoint = $"{baseUrl}/authorize",
                token_endpoint = $"{baseUrl}/token",
                response_types_supported = new[] { "code" },
                subject_types_supported = new[] { "public" },
                id_token_signing_alg_values_supported = new[] { "RS256" },
                code_challenge_methods_supported = new[] { "plain", "S256" },
                grant_types_supported = new[] { "authorization_code", "client_credentials" },
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

        endpoints.MapGet("/authorize", (HttpRequest request, string? client_id, string? redirect_uri, string? response_type, string? state, string? code_challenge, string? code_challenge_method) =>
        {
            if (string.IsNullOrEmpty(redirect_uri) || response_type != "code")
            {
                return Results.BadRequest("Invalid authorize request. Expected response_type=code and a valid redirect_uri.");
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
        {string.Join("\n", MockUsers.All.Values.Distinct().Select(u => $@"
            <li>
                <form method='POST' action='{request.PathBase}/authorize/submit'>
                    <input type='hidden' name='userId' value='{u.Id}' />
                    <input type='hidden' name='redirect_uri' value='{redirect_uri}' />
                    <input type='hidden' name='state' value='{state}' />
                    <input type='hidden' name='code_challenge' value='{code_challenge}' />
                    <input type='hidden' name='code_challenge_method' value='{code_challenge_method}' />
                    <button type='submit'>Login as {u.Name} ({u.Role})</button>
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

            if (!MockUsers.All.TryGetValue(userId, out var user))
            {
                return Results.BadRequest("Invalid user.");
            }

            var code = Guid.NewGuid().ToString("N");
            AuthCodes[code] = new AuthCodeData(userId, redirectUri, codeChallenge, codeChallengeMethod, DateTimeOffset.UtcNow.AddMinutes(5));

            var redirectUrl = $"{redirectUri}?code={code}";
            if (!string.IsNullOrEmpty(state))
            {
                redirectUrl += $"&state={state}";
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
                var tokenResponse = GenerateTokens(user, baseUrl, audience);
                return Results.Ok(tokenResponse);
            }
            else if (grantType == "client_credentials")
            {
                return ClientCredentialsGrant(request, form, registeredClients, baseUrl, audience);
            }

            return Results.BadRequest(new { error = "unsupported_grant_type" });
        });

        return endpoints;
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

    private static object GenerateTokens(MockUser user, string issuer, string audience)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
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

        return new
        {
            access_token = accessToken,
            id_token = accessToken, // Simplification for mock
            token_type = "Bearer",
            expires_in = 3600
        };
    }
}
