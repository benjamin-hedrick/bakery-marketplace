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
/// Provides endpoints for discovery, JWKS, authorization (mock UI), and token minting with PKCE support.
/// See WI-AUTH-005.
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
    public static IEndpointRouteBuilder MapMockOidcIssuer(this IEndpointRouteBuilder endpoints, string audience = "bakery-marketplace")
    {
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
                grant_types_supported = new[] { "authorization_code", "client_credentials" }
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
                var mockUserId = form["mock_user_id"].ToString();
                if (string.IsNullOrEmpty(mockUserId))
                {
                    mockUserId = MockUsers.Customer.Id; // Default
                }

                if (!MockUsers.All.TryGetValue(mockUserId, out var user))
                {
                    return Results.BadRequest(new { error = "invalid_grant", error_description = "Invalid mock_user_id." });
                }

                var tokenResponse = GenerateTokens(user, baseUrl, audience);
                return Results.Ok(tokenResponse);
            }

            return Results.BadRequest(new { error = "unsupported_grant_type" });
        });

        return endpoints;
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
